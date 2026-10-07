// Profile photos. A profile carries a tiny version of its photo — shown at once, and by older
// versions of the app — plus `pv`, which names the real one: a sealed JPEG on a topic of its own,
// fetched when an avatar is shown and kept (sealed) on the phone. A phone that reconnects (which
// phones do all evening) then gets everyone's profile in a few KB instead of their photos.
// Events with old 8-character codes keep the photo in the profile, as before.
//
// IndexedDB: `myav:<roomId>:<pv>` our own photo (for healing brokers that lost it),
// `av:<roomId>:<pid>:<pv>` other people's.
import { getFile, putFile, deleteFile, deleteFilesFrom } from '../core/files.js';
import { unsealBytes, digestHex } from '../core/crypto.js';

const TINY = 48; // px of the stand-in in the profile
const cache = new Map(); // `${pid}:${pv}` -> { url } | { promise }
const MAX = 240;
let current = null; // the open event's room
let busy = 0;
const queue = [];

const bytesOf = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null);
const isJpeg = (b) => b && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function dataUrlBytes(url) {
  const bin = globalThis.atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// The stand-in: the photo at 48 px.
async function tinyOf(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TINY;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, TINY, TINY);
  return canvas.toDataURL('image/jpeg', 0.7);
}

// Saves our profile. `photo` is a new photo (a JPEG data URL from the photo picker), null for none,
// or what the form was given (unchanged).
export async function saveProfile(room, { photo, ...rest }) {
  const prev = room.me?.profile;
  const unchanged = photo === undefined || photo === prev?.photo || (photo && photo === avatarUrl({ pid: room.pid, pv: prev?.pv }));
  if (unchanged) return room.setProfile(rest);
  if (!photo || !room.strong || !/^data:image\/jpeg;base64,/.test(photo)) {
    if (prev?.pv) room.clearAvatar(prev.pv);
    return room.setProfile({ ...rest, photo: photo || null, pv: null });
  }
  const bytes = dataUrlBytes(photo);
  const pv = (await digestHex(bytes)).slice(0, 12);
  const tiny = await tinyOf(photo).catch(() => null);
  const sealed = await room.publishAvatar(pv, bytes);
  show(`${room.pid}:${pv}`, bytes);
  try {
    await putFile(`myav:${room.roomId}:${pv}`, sealed);
    if (prev?.pv && prev.pv !== pv) await deleteFile(`myav:${room.roomId}:${prev.pv}`);
  } catch {
    /* no IndexedDB: the brokers still have it */
  }
  if (prev?.pv && prev.pv !== pv) room.clearAvatar(prev.pv);
  return room.setProfile({ ...rest, photo: tiny, pv });
}

// The open event: where avatars come from, and our own copy for brokers that lost it.
export function bindAvatars(room) {
  current = room;
  room.avatarSource = async (pv) => {
    try {
      return bytesOf(await getFile(`myav:${room.roomId}:${pv}`));
    } catch {
      return null;
    }
  };
}

export function clearAvatars() {
  current = null;
  for (const hit of cache.values()) if (hit.url) URL.revokeObjectURL(hit.url);
  cache.clear();
}

function show(key, bytes) {
  const old = cache.get(key);
  if (old?.url) URL.revokeObjectURL(old.url);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  cache.set(key, { url });
  while (cache.size > MAX) {
    const [oldest, hit] = cache.entries().next().value;
    if (hit.promise) break;
    URL.revokeObjectURL(hit.url);
    cache.delete(oldest);
  }
  return url;
}

// The sharp photo of a player (a blob URL), if this phone has it at hand.
export function avatarUrl(player) {
  return player?.pv ? cache.get(`${player.pid}:${player.pv}`)?.url || null : null;
}

async function limited(fn) {
  if (busy >= 4) await new Promise((resolve) => queue.push(resolve));
  busy++;
  try {
    return await fn();
  } finally {
    busy--;
    queue.shift()?.();
  }
}

// Gets the sharp photo of a player: from this phone, or from a broker (then kept on the phone).
export function loadAvatar(player) {
  const room = current;
  if (!room || !player?.pv) return Promise.resolve(null);
  const { pid, pv } = player;
  const key = `${pid}:${pv}`;
  const hit = cache.get(key);
  if (hit?.url) return Promise.resolve(hit.url);
  if (hit?.promise) return hit.promise;
  const context = `a/${pid}/${pv}`;
  const promise = (async () => {
    let bytes = null;
    try {
      const kept = bytesOf(await getFile(pid === room.pid ? `myav:${room.roomId}:${pv}` : `av:${room.roomId}:${pid}:${pv}`));
      if (kept) bytes = await unsealBytes(room.key, kept, context);
    } catch {
      /* not kept */
    }
    if (!bytes) {
      const got = await limited(() => room.fetchAvatar(pid, pv));
      bytes = got?.bytes || null;
      if (isJpeg(bytes) && pid !== room.pid && (await digestHex(bytes)).startsWith(pv)) keep(room, pid, pv, got.sealed);
    }
    // Only the very photo the profile names (pv is the start of its SHA-256).
    const real = isJpeg(bytes) && (await digestHex(bytes)).startsWith(pv);
    if (current !== room || !real) {
      cache.delete(key);
      return null;
    }
    return show(key, bytes);
  })();
  cache.set(key, { promise });
  return promise;
}

async function keep(room, pid, pv, sealed) {
  if (room.gone) return;
  try {
    await putFile(`av:${room.roomId}:${pid}:${pv}`, sealed);
  } catch {
    /* no IndexedDB: fetched again next time */
  }
}

// Leaving or deleting an event removes the profile photos this phone kept for it.
export async function forgetAvatars(roomId) {
  try {
    await deleteFilesFrom(`av:${roomId}:`);
    await deleteFilesFrom(`myav:${roomId}:`);
    await deleteFile(`avs:${roomId}`); // (the list earlier versions kept)
  } catch {
    /* nothing kept */
  }
}
