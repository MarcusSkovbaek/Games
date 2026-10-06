import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encodeConnect, encodePublish, encodeSubscribe, encodeUnsubscribe, parsePackets, MqttClient } from '../../skaal/js/sync/mqtt.js';
import { startBroker } from '../support/broker.mjs';

const require = createRequire(import.meta.url);
const mqttPacket = require('mqtt-packet');

// Clients are stopped after every test, also a failing one, so none keeps reconnecting.
const clients = new Set();
const client = (options) => {
  const c = new MqttClient(options);
  clients.add(c);
  return c;
};
afterEach(() => {
  for (const c of clients) c.stop();
  clients.clear();
});

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

test('UNSUBSCRIBE encodes per spec', () => {
  const [p] = parseWithReference(encodeUnsubscribe(9, ['a/b', 'c/#']));
  assert.equal(p.cmd, 'unsubscribe');
  assert.equal(p.messageId, 9);
  assert.deepEqual(p.unsubscriptions, ['a/b', 'c/#']);
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
    const a = client({ url: broker.url, clientId: 'a', keepalive: 10 });
    a.setWill({ topic: 'room/presence/a', payload: new TextEncoder().encode('off'), retain: true, qos: 0 });
    a.start();
    await until(() => a.online);
    a.publish('room/state/a', new TextEncoder().encode('v1'), { retain: true, qos: 1 });
    a.publish('room/state/a', new TextEncoder().encode('v2'), { retain: true, qos: 1 });
    await until(() => a.flushed);

    const b = client({
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

test('fetching one retained message: big payloads, missing topics, no lasting subscription', async () => {
  const broker = await startBroker();
  try {
    const big = new Uint8Array(260_000).map((_, i) => (i * 7) % 256);
    const a = client({ url: broker.url, clientId: 'fa', keepalive: 10 });
    a.start();
    await until(() => a.online);
    a.publish('room-f/photo1', big, { retain: true, qos: 1 });
    await until(() => a.flushed);

    const got = [];
    const b = client({ url: broker.url, clientId: 'fb', keepalive: 10, onMessage: (topic) => got.push(topic) });
    assert.equal(await b.fetchRetained('room-f/photo1'), null, 'offline: nothing');
    b.start();
    await until(() => b.online);
    const [one, same] = await Promise.all([b.fetchRetained('room-f/photo1'), b.fetchRetained('room-f/photo1')]);
    assert.equal(one.length, big.length);
    assert.equal(one[259_999], big[259_999]);
    assert.equal(same, one, 'two requests for the same topic share one fetch');
    const started = Date.now();
    assert.equal(await b.fetchRetained('room-f/none', { graceMs: 300 }), null, 'a topic without a retained message');
    assert.ok(Date.now() - started < 3000);
    assert.equal(b.fetches.size, 0);

    // The fetch did not leave a subscription behind.
    a.publish('room-f/photo1', Uint8Array.of(1), { retain: true, qos: 1 });
    await until(() => a.flushed);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(got, []);
    // An emptied (deleted) retained message reads as missing.
    a.publish('room-f/photo1', new Uint8Array(0), { retain: true, qos: 1 });
    await until(() => a.flushed);
    assert.equal(await b.fetchRetained('room-f/photo1', { graceMs: 300 }), null);
    a.stop();
    b.stop();
  } finally {
    await broker.close();
  }
});

test('oversized packets are skipped, not buffered — and the stream stays in step', () => {
  const small = (t) => Uint8Array.from(mqttPacket.generate({ cmd: 'publish', topic: t, payload: Buffer.from('ok'), qos: 0 }));
  const big = Uint8Array.from(mqttPacket.generate({ cmd: 'publish', topic: 'big', payload: Buffer.alloc(50_000, 1), qos: 0 }));
  const all = new Uint8Array([...small('a'), ...big, ...small('b')]);
  const whole = parsePackets(all, 10_000);
  assert.deepEqual(whole.packets.map((p) => p.topic), ['a', 'b'], 'a complete oversized packet in the buffer is dropped');
  assert.equal(whole.skip, 0);
  // Only part of the big packet has arrived: everything after what we have must be skipped.
  const part = parsePackets(all.subarray(0, small('a').length + 20_000), 10_000);
  assert.deepEqual(part.packets.map((p) => p.topic), ['a']);
  assert.equal(part.rest.length, 0);
  assert.equal(part.skip, big.length - 20_000);
});

test('a stranger’s huge message on our topic is skipped without dropping the connection', async () => {
  const broker = await startBroker();
  try {
    const a = client({ url: broker.url, clientId: 'xa', keepalive: 10 });
    a.start();
    await until(() => a.online);
    a.publish('room/huge', new Uint8Array(600_000).fill(7), { retain: true, qos: 1 });
    a.publish('room/fine', Uint8Array.of(1, 2, 3), { retain: true, qos: 1 });
    await until(() => a.flushed);
    const got = [];
    const statuses = [];
    const b = client({
      url: broker.url,
      clientId: 'xb',
      keepalive: 10,
      maxPacket: 100_000,
      onMessage: (topic, payload) => got.push([topic, payload.length]),
      onStatus: (st) => statuses.push(st),
    });
    b.subscribe('room/#');
    b.start();
    await until(() => got.some(([t]) => t === 'room/fine'));
    a.publish('room/after', Uint8Array.of(9), { qos: 1 });
    await until(() => got.some(([t]) => t === 'room/after'));
    assert.deepEqual(got.map(([t]) => t).sort(), ['room/after', 'room/fine']);
    assert.equal(b.skipped, 1);
    assert.deepEqual(statuses.filter((st) => st !== 'connecting'), ['online'], 'never dropped');
    a.stop();
    b.stop();
  } finally {
    await broker.close();
  }
});

// A broker that hangs up on any message bigger than `limit` — what public brokers tend to do.
async function startPickyBroker(limit) {
  const { WebSocketServer } = await import('ws');
  const received = [];
  const sockets = new Set();
  const wss = new WebSocketServer({ port: 0, handleProtocols: (p) => (p.has('mqtt') ? 'mqtt' : false) });
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    const parser = mqttPacket.parser({ protocolVersion: 4 });
    const send = (packet) => ws.send(mqttPacket.generate(packet));
    parser.on('packet', (p) => {
      if (ws.readyState !== 1) return;
      if (p.cmd === 'connect') send({ cmd: 'connack', returnCode: 0, sessionPresent: false });
      else if (p.cmd === 'subscribe') send({ cmd: 'suback', messageId: p.messageId, granted: p.subscriptions.map(() => 0) });
      else if (p.cmd === 'pingreq') send({ cmd: 'pingresp' });
      else if (p.cmd === 'publish' && p.payload.length > limit) ws.terminate();
      else if (p.cmd === 'publish') {
        received.push(p.topic);
        if (p.qos === 1) send({ cmd: 'puback', messageId: p.messageId });
      }
    });
    parser.on('error', () => ws.terminate());
    ws.on('message', (data) => parser.parse(Buffer.from(data)));
  });
  await new Promise((r) => wss.on('listening', r));
  return {
    url: `ws://127.0.0.1:${wss.address().port}`,
    received,
    close: () => {
      for (const ws of sockets) ws.terminate();
      return new Promise((r) => wss.close(r));
    },
  };
}

test('a broker that hangs up on big messages: its limit is learned instead of being shut out', async () => {
  const broker = await startPickyBroker(100_000);
  try {
    const limits = [];
    const c = client({ url: broker.url, clientId: 'picky', keepalive: 30, onLimit: (n) => limits.push(n) });
    c.start();
    await until(() => c.online);
    c.publish('t/small', new Uint8Array(1000), { retain: true });
    c.publish('t/photo', new Uint8Array(150_000), { retain: true }); // the broker hangs up …
    c.publish('t/after', new Uint8Array(2000), { retain: true }); // … and this one waits behind it
    await until(() => limits.length === 1 && c.online && c.flushed, 15000);
    assert.equal(limits[0], 149_999, 'the biggest waiting message was too big');
    assert.deepEqual([...new Set(broker.received)], ['t/small', 't/after']);

    // Still too big: the limit comes down step by step, and small messages keep flowing.
    c.publish('t/photo2', new Uint8Array(120_000), { retain: true });
    c.publish('t/late', new Uint8Array(10), { retain: true });
    await until(() => limits.length === 2 && c.online && c.flushed, 15000);
    assert.equal(limits[1], 119_999);
    assert.ok(broker.received.includes('t/late'));
    c.publish('t/fits', new Uint8Array(90_000), { retain: true });
    await until(() => c.flushed);
    assert.ok(broker.received.includes('t/fits'));
    assert.ok(!broker.received.some((t) => t.startsWith('t/photo')));
    assert.equal(c.bigOk, 90_000);

    // A limit learned earlier applies from the start; under 64 KB always goes.
    const d = client({ url: broker.url, clientId: 'picky2', keepalive: 30, maxOut: 80_000 });
    d.start();
    await until(() => d.online);
    d.publish('u/big', new Uint8Array(90_000), { retain: true });
    d.publish('u/small', new Uint8Array(60_000), { retain: true });
    await until(() => d.flushed);
    assert.ok(broker.received.includes('u/small'));
    assert.ok(!broker.received.includes('u/big'));
    assert.equal(client({ url: broker.url, maxOut: 1000 }).maxOut, 64 * 1024 - 1, 'never below 64 KB');
  } finally {
    await broker.close();
  }
});
