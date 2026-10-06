// Photos from the evening: taken in the app, seen by everyone in the event — and nobody else.
//
// A photo is three things (see game/photos.js for the log entry):
//   - a small thumbnail (~30 KB), synced to every phone straight away as shared image `a/<name>`
//   - the full-size JPEG, kept on the brokers and fetched only when someone looks at it
//   - an entry in the log of the one who took it, with the caption
// Everything is end-to-end encrypted with the event key, so the brokers only ever hold
// ciphertext. The phone that took a photo keeps its own copy — encrypted the same way — so it can
// put the photo back on a broker that lost it. Other phones keep photos in memory only.
import { randomId } from '../core/ids.js';
import { getFile, putFile, deleteFile } from '../core/files.js';
import { seal, unseal, unsealBytes } from '../core/crypto.js';
import { photoPrefix } from '../game/photos.js';

export const PHOTO = {
  fullEdge: 1600, // longest side of the full-size photo
  fullMaxBytes: 230_000, // keeps one photo inside one broker message
  thumbEdge: 480,
  thumbMaxChars: 48_000,
  captionMax: 140,
};

// ------------------------------------------------------------------------------ preparing

function canvasFor(source, sw, sh, edge, mirror) {
  const scale = Math.min(1, edge / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, q) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q));

// Draws the picture again (which also drops EXIF data such as GPS position) as a full-size JPEG
// and a thumbnail. `source` is a video element (the camera), an image bitmap or an image.
export async function preparePhoto(source, { mirror = false } = {}) {
  const sw = source.videoWidth || source.naturalWidth || source.width;
  const sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) return null;
  let full = null;
  let size = null;
  for (const edge of [PHOTO.fullEdge, 1280, 1024, 800]) {
    const canvas = canvasFor(source, sw, sh, edge, mirror);
    for (const q of [0.86, 0.78, 0.7, 0.62, 0.54]) {
      const blob = await toBlob(canvas, q);
      if (blob && blob.size <= PHOTO.fullMaxBytes) {
        full = new Uint8Array(await blob.arrayBuffer());
        size = { w: canvas.width, h: canvas.height };
        break;
      }
    }
    if (full) break;
  }
  if (!full) return null;
  const small = canvasFor(source, sw, sh, PHOTO.thumbEdge, mirror);
  let thumb = null;
  for (const q of [0.74, 0.64, 0.54, 0.44]) {
    thumb = small.toDataURL('image/jpeg', q);
    if (thumb.length <= PHOTO.thumbMaxChars) break;
  }
  return { full, thumb, ...size };
}

// A picture picked from the phone (camera roll), turned right way up.
export async function bitmapFromFile(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await globalThis.createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall back to an image element */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// ------------------------------------------------------------------------ sharing, deleting

export async function sharePhoto(room, prepared, caption = '') {
  if (!room.strong) throw new Error('Photos need an event with a 12-character code');
  const name = `${photoPrefix(room.pid)}${randomId(6)}`;
  const full = await room.sealFull(name, prepared.full);
  room.publishFull(name, full);
  const asset = room.setAsset(name, prepared.thumb);
  remember(full, name);
  keep(room, name, asset, full);
  return room.append({ t: 'photo', a: name, cap: String(caption || '').trim().slice(0, PHOTO.captionMax), w: prepared.w, h: prepared.h, f: 1 });
}

// Your own photo is deleted; anyone else's is hidden (host, or the pub golf judge). Either way it
// leaves every phone and the brokers: the log entry says so for good, and the thumbnail and the
// full size are wiped from the brokers right away (the phone that took it drops its own copy
// when it sees that — see dropGoneCopies).
export function removePhoto(room, photo) {
  removePhotos(room, [photo]);
}

// The host clears every photo of the event at once (e.g. the morning after).
export function removePhotos(room, photos) {
  room.appendMany(photos.map((ph) => (ph.pid === room.pid ? { t: 'x', r: ph.id } : { t: 'phide', k: ph.key })));
  for (const ph of photos) {
    room.setAsset(ph.asset, null);
    if (ph.full) room.clearFull(ph.asset);
    if (ph.pid === room.pid) drop(room, ph.asset);
  }
}

// ---------------------------------------------------------------- this phone's own copies
// IndexedDB: `photos:<roomId>` lists the names, `photo:<name>` holds the sealed thumbnail asset
// and `full:<name>` the sealed full-size photo — encrypted exactly as on the brokers.

const listKey = (room) => `photos:${room.roomId}`;
const kept = new Map(); // roomId -> names of the photos this phone keeps a copy of

async function keep(room, name, asset, full) {
  if (!kept.has(room.roomId)) kept.set(room.roomId, new Set());
  kept.get(room.roomId).add(name);
  try {
    await putFile(`photo:${name}`, await seal(room.key, asset, `a/${name}`));
    await putFile(`full:${name}`, full);
    const list = (await getFile(listKey(room))) || [];
    await putFile(listKey(room), [...new Set([...list, name])]);
  } catch {
    /* no IndexedDB: the brokers still have it */
  }
}

async function drop(room, name) {
  forget(name);
  kept.get(room.roomId)?.delete(name);
  try {
    await deleteFile(`photo:${name}`);
    await deleteFile(`full:${name}`);
    const list = (await getFile(listKey(room))) || [];
    await putFile(listKey(room), list.filter((x) => x !== name));
  } catch {
    /* nothing kept */
  }
}

// On opening an event: put this phone's own photos back (so they show and heal even if every
// broker lost them) and let the room re-send full-size photos to brokers that lost them.
export async function restorePhotos(room) {
  room.fullSource = async (name) => {
    try {
      const v = await getFile(`full:${name}`);
      return v ? new Uint8Array(v) : null;
    } catch {
      return null;
    }
  };
  try {
    const list = (await getFile(listKey(room))) || [];
    kept.set(room.roomId, new Set(list));
    for (const name of list) {
      const copy = await getFile(`photo:${name}`);
      if (!copy) continue;
      // The first pub golf version kept the thumbnail unencrypted: seal it now.
      const sealed = copy instanceof Uint8Array || copy instanceof ArrayBuffer;
      const asset = sealed ? await unseal(room.key, new Uint8Array(copy), `a/${name}`) : copy;
      if (!asset) continue;
      room.restoreAsset(name, asset);
      if (!sealed) await putFile(`photo:${name}`, await seal(room.key, asset, `a/${name}`));
    }
  } catch {
    /* no IndexedDB */
  }
  dropGoneCopies(room);
  room.healNow();
}

// Our own photos that someone hid (or that were deleted on another phone of ours) are wiped from
// the brokers — so this phone lets go of its copies too, and never puts them back.
export function dropGoneCopies(room) {
  for (const name of kept.get(room.roomId) || []) {
    const asset = room.state.assets[name];
    if (asset && !asset.data) drop(room, name);
  }
}

// Leaving or deleting an event removes this phone's copies of its photos.
export async function forgetPhotos(roomId) {
  try {
    const key = `photos:${roomId}`;
    for (const name of (await getFile(key)) || []) {
      await deleteFile(`photo:${name}`);
      await deleteFile(`full:${name}`);
    }
    await deleteFile(key);
  } catch {
    /* nothing kept */
  }
}

// ------------------------------------------------------------------- loading full-size photos
// Decrypted photos live in memory only, as blob URLs, and the oldest are let go.

const MAX_CACHED = 24;
const cache = new Map(); // name -> { url } | { promise }
let inflight = 0;
const queue = [];

function remember(sealedOrUrl, name) {
  // A photo we just took is shown from its sealed bytes the first time someone opens it here.
  if (sealedOrUrl instanceof Uint8Array) cache.set(name, { sealed: sealedOrUrl });
}

function forget(name) {
  const hit = cache.get(name);
  if (hit?.url) URL.revokeObjectURL(hit.url);
  cache.delete(name);
}

function trim() {
  while (cache.size > MAX_CACHED) {
    const [oldest, hit] = cache.entries().next().value;
    if (hit.promise) break;
    if (hit.url) URL.revokeObjectURL(hit.url);
    cache.delete(oldest);
  }
}

async function limited(fn) {
  if (inflight >= 2) await new Promise((resolve) => queue.push(resolve));
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    queue.shift()?.();
  }
}

export function cachedFull(photo) {
  return cache.get(photo.asset)?.url || null;
}

// A blob URL for the full-size photo, or null if no broker has it right now. Old photos without a
// full-size version are their thumbnail.
export function loadFull(room, photo) {
  if (!photo.full) return Promise.resolve(photo.thumb);
  const hit = cache.get(photo.asset);
  if (hit?.url) {
    cache.delete(photo.asset);
    cache.set(photo.asset, hit); // most recently used
    return Promise.resolve(hit.url);
  }
  if (hit?.promise) return hit.promise;
  const promise = (async () => {
    let bytes = null;
    if (hit?.sealed) bytes = await unsealBytes(room.key, hit.sealed, `f/${photo.asset}`);
    if (!bytes && photo.pid === room.pid) {
      const own = await room.fullSource?.(photo.asset);
      if (own) bytes = await unsealBytes(room.key, own, `f/${photo.asset}`);
    }
    if (!bytes) bytes = await limited(() => room.fetchFull(photo.asset));
    // Only ever show a JPEG (FF D8 FF), whatever someone managed to put on the broker.
    if (bytes && !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) bytes = null;
    if (!bytes) {
      cache.delete(photo.asset);
      return null;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    cache.set(photo.asset, { url });
    trim();
    return url;
  })();
  cache.set(photo.asset, { promise });
  return promise;
}

// Closing an event lets go of its decrypted photos.
export function clearPhotoCache() {
  for (const hit of cache.values()) if (hit.url) URL.revokeObjectURL(hit.url);
  cache.clear();
}
