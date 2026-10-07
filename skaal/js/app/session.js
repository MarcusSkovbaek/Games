// The event this device currently has open, plus the list of recently used events.
import { createStore } from '../ui/kit.js';
import { deriveRoom } from '../core/crypto.js';
import { Room } from '../sync/room.js';
import { resolveBrokers } from '../config.js';
import * as storage from '../core/storage.js';
import { randomId } from '../core/ids.js';
import { now } from '../core/clock.js';
import { derive } from '../game/derive.js';
import { getFile, putFile, deleteFile } from '../core/files.js';
import { clearPhotoCache } from './photos.js';
import { bindAvatars, clearAvatars } from './avatars.js';

export const session = createStore({ code: null, room: null, status: 'idle', version: 0, sync: null });

// ------------------------------------------------------------------------- recent events

export function recentEvents() {
  const list = storage.load('events', []);
  return Array.isArray(list) ? list.filter((e) => e && typeof e.code === 'string') : [];
}

export function rememberEvent(code, patch) {
  const list = recentEvents();
  const i = list.findIndex((e) => e.code === code);
  const next = { ...(i >= 0 ? list[i] : { code }), ...patch, lastOpened: Date.now() };
  if (i >= 0) list.splice(i, 1);
  list.unshift(next);
  storage.save('events', list.slice(0, 12));
  for (const old of list.slice(12)) forgetKeys(old.code);
  return next;
}

export function forgetEvent(code) {
  storage.save(
    'events',
    recentEvents().filter((e) => e.code !== code),
  );
  forgetKeys(code);
}

// An event's keys take a deliberately slow derivation (see core/crypto.js). The phone keeps what
// it derived — the key as a CryptoKey, which can't be read out of the browser — so reopening an
// event (every time the app starts) doesn't take the phone a second to think.
const keysName = (code) => `keys:v2:${code}`;

async function roomKeys(code) {
  try {
    const kept = await getFile(keysName(code));
    if (typeof kept?.roomId === 'string' && kept.key?.type === 'secret' && typeof kept.strong === 'boolean') return kept;
  } catch {
    /* not kept (or no IndexedDB) */
  }
  const keys = await deriveRoom(code);
  putFile(keysName(code), keys).catch(() => {});
  return keys;
}

function forgetKeys(code) {
  deleteFile(keysName(code)).catch(() => {});
}

export function pidFor(code) {
  return recentEvents().find((e) => e.code === code)?.pid || null;
}

// ------------------------------------------------------------------------------- session

let current = null;
let opening = null;

export async function openEvent(code) {
  if (current?.code === code) return current.room;
  if (opening?.code === code) return opening.promise;
  closeEvent();
  const promise = (async () => {
    session.set({ code, status: 'connecting', room: null });
    const { roomId, key, strong } = await roomKeys(code);
    let pid = pidFor(code);
    if (!pid) pid = randomId(12);
    rememberEvent(code, { pid });
    const room = new Room({ code, roomId, key, pid, strong, brokers: resolveBrokers() });
    const off = [
      room.on('change', (version) => {
        session.set({ version });
        const name = room.state.meta?.name;
        if (name && recentEvents()[0]?.name !== name) rememberEvent(code, { name, host: room.isHost() });
      }),
      room.on('status', (sync) => session.set({ sync })),
    ];
    if (opening?.promise !== promise) {
      // Another event was opened while we were deriving keys.
      off.forEach((f) => f());
      return null;
    }
    current = { code, room, off };
    opening = null;
    bindAvatars(room);
    session.set({ room, status: 'ready', version: room.version, sync: room.status });
    await room.start();
    return room;
  })();
  opening = { code, promise };
  return promise;
}

export function closeEvent() {
  opening = null;
  if (!current) return;
  current.off.forEach((f) => f());
  current.room.stop();
  current = null;
  clearPhotoCache();
  clearAvatars();
  session.set({ code: null, room: null, status: 'idle', sync: null });
}

// ------------------------------------------------------------------------------- derived

let cache = { room: null, version: -1, sec: -1, d: null };

export function getDerived(room, t = now()) {
  const sec = Math.floor(t / 1000);
  if (cache.room === room && cache.version === room.version && cache.sec === sec) return cache.d;
  const d = derive(room, t);
  cache = { room, version: room.version, sec, d };
  return d;
}

export function invalidateDerived() {
  cache = { room: null, version: -1, sec: -1, d: null };
}
