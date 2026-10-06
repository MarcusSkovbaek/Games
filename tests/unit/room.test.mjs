import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, cleanAsset } from '../../skaal/js/sync/room.js';
import { deriveRoom, seal, unseal, sealBytes, unsealBytes, sha256Hex } from '../../skaal/js/core/crypto.js';
import { randomCode, isValidCode, isStrongCode, formatCode, CODE_LENGTH } from '../../skaal/js/core/ids.js';
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

test('crypto: 12-character codes use one slow derivation; old 8-character codes still open', async () => {
  const code = randomCode();
  assert.equal(code.length, CODE_LENGTH);
  assert.ok(isValidCode(code) && isStrongCode(code));
  assert.ok(isValidCode('ABCDEFGH') && !isStrongCode('ABCDEFGH'), 'old codes are valid but weak');
  assert.ok(!isValidCode('ABCDEFGHJK'));
  assert.equal(formatCode('K7F2QXRM8HJP'), 'K7F2-QXRM-8HJP');
  assert.equal(formatCode('K7F2QXRM'), 'K7F2-QXRM');

  const strong = await deriveRoom('K7F2QXRM8HJP');
  const again = await deriveRoom('K7F2QXRM8HJP');
  const other = await deriveRoom('K7F2QXRM8HJQ');
  assert.equal(strong.strong, true);
  assert.equal(strong.roomId.length, 24);
  assert.equal(strong.roomId, again.roomId);
  assert.notEqual(strong.roomId, other.roomId);
  // The topic no longer gives the code away to a quick hash.
  assert.notEqual(strong.roomId, (await sha256Hex('skaal:room:K7F2QXRM8HJP')).slice(0, 24));
  const box = await seal(strong.key, { a: 1 }, 'm');
  assert.deepEqual(await unseal(again.key, box, 'm'), { a: 1 });
  assert.equal(await unseal(other.key, box, 'm'), null);

  // Old events keep their topic and key, so they still open.
  const legacy = await deriveRoom('ABCDEFGH');
  assert.equal(legacy.strong, false);
  assert.equal(legacy.roomId, (await sha256Hex('skaal:room:ABCDEFGH')).slice(0, 24));

  // Photos travel as raw encrypted bytes, bound to their topic.
  const bytes = new Uint8Array(5000).map((_, i) => i % 256);
  const sealed = await sealBytes(strong.key, bytes, 'f/ph-x');
  assert.equal(sealed.length, bytes.length + 29, 'no base64 overhead');
  assert.deepEqual(await unsealBytes(again.key, sealed, 'f/ph-x'), bytes);
  assert.equal(await unsealBytes(again.key, sealed, 'f/ph-y'), null, 'moved to another topic');
  assert.equal(await unsealBytes(other.key, sealed, 'f/ph-x'), null, 'wrong key');
  assert.equal(await unsealBytes(strong.key, box, 'm'), null, 'a JSON payload is not a photo');
});

async function makeRoom(code, pid, brokers) {
  const { roomId, key, strong } = await deriveRoom(code);
  const room = new Room({ code, roomId, key, pid, brokers, persist: false, strong });
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

test('photos: thumbnails reach everyone, the full size is fetched on demand, healed by its owner and cleared on delete', async () => {
  let broker = await startBroker();
  const port = broker.port;
  const brokers = [{ id: 'local', url: broker.url }];
  const code = 'K7F2QXRM8HJP';
  const anna = await makeRoom(code, 'annapid01', brokers);
  const bo = await makeRoom(code, 'bopid0001', brokers);
  const rooms = [anna, bo];
  try {
    await until(() => anna.status.online === 1 && bo.status.online === 1, 6000, 'online');
    const name = 'ph-annapid01-abc123';
    const full = new Uint8Array(220_000).map((_, i) => (i * 13) % 256);
    const sealed = await anna.sealFull(name, full);
    anna.fullSource = async (n) => (n === name ? sealed : null);
    anna.publishFull(name, sealed);
    anna.setAsset(name, 'data:image/jpeg;base64,AAAA');
    await until(() => bo.state.assets[name]?.data, 6000, 'thumbnail reached Bo');
    assert.equal(Object.keys(bo.state.assets).length, 1, 'the full size is not pushed to everyone');
    const got = await bo.fetchFull(name);
    assert.equal(got.length, full.length);
    assert.equal(got[219_999], full[219_999]);
    assert.equal(await bo.fetchFull('ph-annapid01-nopeee'), null, 'no such photo');

    // The broker loses everything while Anna is away. Bo has her thumbnail, but does not bring
    // it back on his own — a thumbnail without its full size would hide that the photo is gone.
    anna.stop();
    await wait(300);
    await broker.close();
    broker = await startBroker({ port });
    await until(() => bo.status.online === 1, 15000, 'Bo reconnected');
    await wait(SYNC.settleMs + 3500);
    const late = await makeRoom(code, 'latepid01', brokers);
    rooms.push(late);
    await wait(SYNC.settleMs + 800);
    assert.equal(late.state.assets[name], undefined, 'nobody but Anna heals her photo');
    // Anna's phone comes back and puts the thumbnail and the full size back together.
    await anna.start();
    await until(() => late.state.assets[name]?.data, 8000, 'thumbnail healed');
    assert.equal((await late.fetchFull(name))?.length, full.length, 'full size healed by its owner');

    // Deleting empties the thumbnail and clears the full size from the broker.
    anna.setAsset(name, null);
    anna.clearFull(name);
    await until(() => late.state.assets[name] && !late.state.assets[name].data, 6000, 'tombstone');
    assert.equal(await late.fetchFull(name), null);
  } finally {
    rooms.forEach((r) => r.stop());
    await wait(200);
    await broker.close();
  }
});
