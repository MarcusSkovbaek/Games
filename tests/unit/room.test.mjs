import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, cleanAsset } from '../../skaal/js/sync/room.js';
import { deriveRoom, seal, unseal } from '../../skaal/js/core/crypto.js';
import { SYNC } from '../../skaal/js/config.js';
import { startBroker } from '../support/broker.mjs';

SYNC.settleMs = 300; // speed up healing in tests

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 6000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(25);
  }
  throw new Error(`${label} not met in time`);
}

test('crypto: round trip, wrong key and wrong topic are rejected', async () => {
  const a = await deriveRoom('ABCDEFGH');
  const b = await deriveRoom('ABCDEFGJ');
  assert.equal(a.roomId.length, 24);
  assert.notEqual(a.roomId, b.roomId);
  const box = await seal(a.key, { hello: 'skål ÆØÅ 🍺' }, 'p/x/l');
  assert.deepEqual(await unseal(a.key, box, 'p/x/l'), { hello: 'skål ÆØÅ 🍺' });
  assert.equal(await unseal(b.key, box, 'p/x/l'), null, 'wrong key');
  assert.equal(await unseal(a.key, box, 'p/y/l'), null, 'ciphertext moved to another topic');
  assert.equal(await unseal(a.key, new Uint8Array([1, 2, 3]), 'p/x/l'), null, 'garbage');
});

async function makeRoom(code, pid, brokers) {
  const { roomId, key } = await deriveRoom(code);
  const room = new Room({ code, roomId, key, pid, brokers, persist: false });
  await room.start();
  return room;
}

const drinks = (room, pid) =>
  [...(room.state.players[pid]?.entries.values() || [])].filter((e) => e.t === 'd').length;

test('three devices converge; late joiner gets retained state; healing after broker data loss', async () => {
  let broker = await startBroker();
  const port = broker.port;
  const brokers = [{ id: 'local', url: broker.url }];
  const code = 'K7F2QXRM';
  const host = await makeRoom(code, 'hostpid01', brokers);
  const anna = await makeRoom(code, 'annapid01', brokers);
  try {
    await until(() => host.status.online === 1 && anna.status.online === 1, 6000, 'online');
    host.setMeta({ name: 'Fredagsbar', hostId: 'hostpid01', createdAt: Date.now(), startedAt: Date.now(), settings: {} });
    host.setProfile({ name: 'Host', joinedAt: Date.now() });
    anna.setProfile({ name: 'Anna', joinedAt: Date.now() });
    host.append({ t: 'd', k: 'beer' });
    anna.appendMany([{ t: 'd', k: 'shot' }, { t: 'd', k: 'beer' }]);
    await until(() => anna.state.meta?.name === 'Fredagsbar', 6000, 'meta reached anna');
    await until(() => drinks(host, 'annapid01') === 2 && drinks(anna, 'hostpid01') === 1, 6000, 'logs crossed');
    assert.equal(host.state.players.annapid01.profile.name, 'Anna');
    assert.ok(host.isOnline('annapid01'), 'presence');

    // Late joiner sees everything from retained messages alone.
    const bo = await makeRoom(code, 'bopid0001', brokers);
    await until(() => bo.state.meta && drinks(bo, 'annapid01') === 2 && drinks(bo, 'hostpid01') === 1, 6000, 'late joiner');

    // Concurrent writes from two devices of the same player converge (union, not overwrite).
    const annaTablet = await makeRoom(code, 'annapid01', brokers);
    await until(() => drinks(annaTablet, 'annapid01') === 2, 6000, 'second device synced');
    anna.append({ t: 'd', k: 'drink' });
    annaTablet.append({ t: 'd', k: 'jager' });
    await until(() => drinks(bo, 'annapid01') === 4 && drinks(anna, 'annapid01') === 4 && drinks(annaTablet, 'annapid01') === 4, 8000, 'union of concurrent writes');
    annaTablet.stop();

    // Broker loses all retained data (restart). Anna goes offline; the host's device must heal
    // Anna's data back so a brand-new device still sees her drinks.
    anna.stop();
    await wait(300);
    await broker.close();
    broker = await startBroker({ port });
    await until(() => host.status.online === 1 && bo.status.online === 1, 15000, 'reconnected after restart');
    await wait(SYNC.settleMs + 3500);
    const fresh = await makeRoom(code, 'freshpid1', [{ id: 'local', url: broker.url }]);
    await until(() => fresh.state.meta?.name === 'Fredagsbar' && drinks(fresh, 'annapid01') === 4 && fresh.state.players.annapid01.profile?.name === 'Anna', 8000, 'healed state visible to fresh device');
    fresh.stop();
    bo.stop();
  } finally {
    host.stop();
    await wait(300);
    await broker.close();
  }
});

test('a deleted event stays deleted: other devices do not heal player data back', async () => {
  const broker = await startBroker();
  const brokers = [{ id: 'local', url: broker.url }];
  const code = 'DELE7EMQ';
  const host = await makeRoom(code, 'hostpid02', brokers);
  const guest = await makeRoom(code, 'guestpid2', brokers);
  try {
    await until(() => host.status.online && guest.status.online, 6000, 'online');
    host.setMeta({ name: 'Slet mig', hostId: 'hostpid02', createdAt: Date.now(), startedAt: Date.now(), settings: {} });
    guest.setProfile({ name: 'Guest', joinedAt: Date.now() });
    guest.append({ t: 'd', k: 'beer' });
    await until(() => host.state.players.guestpid2?.entries.size === 1, 6000, 'synced');
    await host.destroy();
    await until(() => guest.state.meta?.deleted, 6000, 'guest saw deletion');
    // Force the guest to reconnect and run its healing pass (own topics heal right after settling).
    broker.dropClients();
    await until(() => guest.status.online === 0, 6000, 'guest dropped');
    await until(() => guest.status.online === 1 && guest.brokers[0].settled, 15000, 'guest reconnected and settled');
    await wait(1200);
    const fresh = await makeRoom(code, 'freshpid2', brokers);
    try {
      await until(() => fresh.state.meta?.deleted, 6000, 'fresh sees tombstone');
      await wait(1000);
      assert.equal(fresh.state.players.guestpid2?.entries.size || 0, 0, 'player log must not come back');
    } finally {
      fresh.stop();
    }
  } finally {
    host.stop();
    guest.stop();
    await wait(300);
    await broker.close();
  }
});

test('shared images: the host\'s pictures reach everyone (also late joiners), newest wins, junk is dropped', async () => {
  const broker = await startBroker();
  const brokers = [{ id: 'local', url: broker.url }];
  const code = 'TQURM7KX';
  const host = await makeRoom(code, 'hostpid03', brokers);
  const guest = await makeRoom(code, 'guestpid3', brokers);
  const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  try {
    await until(() => host.status.online && guest.status.online, 6000, 'online');
    host.setMeta({ name: 'Touren', hostId: 'hostpid03', createdAt: Date.now(), startedAt: Date.now(), settings: { tour: true } });
    host.setAsset('tour-face-bobby', img);
    host.setAsset('tour-mask', img);
    await until(() => guest.asset('tour-face-bobby') === img && guest.asset('tour-mask') === img, 6000, 'images reached guest');

    // Back to the default picture: null wins because it is newer.
    host.setAsset('tour-face-bobby', null);
    await until(() => guest.state.assets['tour-face-bobby']?.v === 2, 6000, 'reset reached guest');
    assert.equal(guest.asset('tour-face-bobby'), null);

    const late = await makeRoom(code, 'latepid03', brokers);
    try {
      await until(() => late.asset('tour-mask') === img && late.state.assets['tour-face-bobby']?.v === 2, 6000, 'late joiner got retained images');
    } finally {
      late.stop();
    }

    assert.equal(cleanAsset({ v: 1, data: 'javascript:alert(1)' }).data, null, 'only image data urls');
    assert.equal(cleanAsset({ v: 1, data: 'data:image/png;base64,' + 'A'.repeat(400_000) }).data, null, 'size limit');
    assert.throws(() => host.setAsset('../evil', img), /Invalid asset name/);
  } finally {
    host.stop();
    guest.stop();
    await wait(300);
    await broker.close();
  }
});
