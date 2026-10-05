import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encodeConnect, encodePublish, encodeSubscribe, parsePackets, MqttClient } from '../../skaal/js/sync/mqtt.js';
import { startBroker } from '../support/broker.mjs';

const require = createRequire(import.meta.url);
const mqttPacket = require('mqtt-packet');

function parseWithReference(bytes) {
  const parser = mqttPacket.parser({ protocolVersion: 4 });
  const out = [];
  parser.on('packet', (p) => out.push(p));
  parser.on('error', (e) => {
    throw e;
  });
  parser.parse(Buffer.from(bytes));
  return out;
}

test('CONNECT encodes per spec (checked with mqtt-packet)', () => {
  const bytes = encodeConnect({
    clientId: 'skaal_abc',
    keepalive: 30,
    username: 'u',
    password: 'p',
    will: { topic: 'a/b', payload: Uint8Array.of(1, 2, 3), retain: true, qos: 0 },
  });
  const [p] = parseWithReference(bytes);
  assert.equal(p.cmd, 'connect');
  assert.equal(p.clientId, 'skaal_abc');
  assert.equal(p.keepalive, 30);
  assert.equal(p.clean, true);
  assert.equal(p.username, 'u');
  assert.equal(p.password.toString(), 'p');
  assert.equal(p.will.topic, 'a/b');
  assert.deepEqual([...p.will.payload], [1, 2, 3]);
  assert.equal(p.will.retain, true);
});

test('PUBLISH encodes large payloads (multi-byte remaining length)', () => {
  const payload = new Uint8Array(300_000).map((_, i) => i % 251);
  const bytes = encodePublish({ topic: 'skaal/v1/x/p/y/l', payload, qos: 1, retain: true, id: 4242 });
  const [p] = parseWithReference(bytes);
  assert.equal(p.cmd, 'publish');
  assert.equal(p.topic, 'skaal/v1/x/p/y/l');
  assert.equal(p.qos, 1);
  assert.equal(p.retain, true);
  assert.equal(p.messageId, 4242);
  assert.equal(p.payload.length, payload.length);
  assert.equal(p.payload[299_999], payload[299_999]);
});

test('SUBSCRIBE encodes per spec', () => {
  const [p] = parseWithReference(encodeSubscribe(7, [{ topic: 'a/#', qos: 0 }, { topic: 'b/+/c', qos: 1 }]));
  assert.equal(p.cmd, 'subscribe');
  assert.equal(p.messageId, 7);
  assert.deepEqual(
    p.subscriptions.map((s) => [s.topic, s.qos]),
    [
      ['a/#', 0],
      ['b/+/c', 1],
    ],
  );
});

test('parser handles packets split and merged across frames', () => {
  const a = Uint8Array.from(mqttPacket.generate({ cmd: 'publish', topic: 't/1', payload: Buffer.from('hello'), qos: 1, messageId: 9, retain: true }));
  const b = Uint8Array.from(mqttPacket.generate({ cmd: 'pingresp' }));
  const c = Uint8Array.from(mqttPacket.generate({ cmd: 'publish', topic: 't/2', payload: Buffer.alloc(20000, 7), qos: 0 }));
  const all = new Uint8Array([...a, ...b, ...c]);
  for (const cut of [1, 2, 5, a.length, a.length + 1, a.length + b.length + 2, all.length - 1]) {
    const first = parsePackets(all.subarray(0, cut));
    const rest = new Uint8Array([...first.rest, ...all.subarray(cut)]);
    const second = parsePackets(rest);
    const packets = [...first.packets, ...second.packets];
    assert.equal(packets.length, 3, `cut at ${cut}`);
    assert.equal(packets[0].topic, 't/1');
    assert.equal(new TextDecoder().decode(packets[0].payload), 'hello');
    assert.equal(packets[0].retain, true);
    assert.equal(packets[0].id, 9);
    assert.equal(packets[1].type, 'pingresp');
    assert.equal(packets[2].payload.length, 20000);
    assert.equal(second.rest.length, 0);
  }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return true;
    await wait(20);
  }
  throw new Error('condition not met in time');
}

test('client talks to a real broker: retained, QoS1 acks, will, reconnect', async () => {
  const broker = await startBroker();
  try {
    const got = [];
    const a = new MqttClient({ url: broker.url, clientId: 'a', keepalive: 10 });
    a.setWill({ topic: 'room/presence/a', payload: new TextEncoder().encode('off'), retain: true, qos: 0 });
    a.start();
    await until(() => a.online);
    a.publish('room/state/a', new TextEncoder().encode('v1'), { retain: true, qos: 1 });
    a.publish('room/state/a', new TextEncoder().encode('v2'), { retain: true, qos: 1 });
    await until(() => a.flushed);

    const b = new MqttClient({
      url: broker.url,
      clientId: 'b',
      keepalive: 10,
      onMessage: (topic, payload, meta) => got.push({ topic, text: new TextDecoder().decode(payload), retain: meta.retain }),
    });
    b.subscribe('room/#');
    b.start();
    await until(() => got.some((m) => m.topic === 'room/state/a'));
    const retained = got.filter((m) => m.topic === 'room/state/a');
    assert.equal(retained.at(-1).text, 'v2');
    assert.equal(retained.at(-1).retain, true);

    // Live message
    a.publish('room/live', new TextEncoder().encode('hi'), { qos: 1 });
    await until(() => got.some((m) => m.topic === 'room/live' && m.text === 'hi'));

    // Abrupt network loss: the broker publishes A's will, and both clients reconnect by themselves.
    broker.dropClients();
    await until(() => got.some((m) => m.topic === 'room/presence/a' && m.text === 'off'), 8000);
    await until(() => a.online && b.online, 8000);

    // Offline outbox: newer retained message replaces older one for the same topic.
    a.stop();
    a.publish('room/state/a', new TextEncoder().encode('v3'), { retain: true, qos: 1 });
    a.publish('room/state/a', new TextEncoder().encode('v4'), { retain: true, qos: 1 });
    assert.equal(a.pending.size, 1);
    a.start();
    await until(() => got.some((m) => m.topic === 'room/state/a' && m.text === 'v4'));
    assert.ok(!got.some((m) => m.text === 'v3'), 'superseded retained message must not be sent');
    await until(() => a.flushed);
    a.stop();
    b.stop();
  } finally {
    await broker.close();
  }
});
