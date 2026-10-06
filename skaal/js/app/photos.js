// Photos from the evening: taken in the app, seen by everyone in the event — and nobody else.
//
// A photo is three things (see game/photos.js for the log entry):
//   - an entry in the log of the one who took it, with the caption
//   - a small thumbnail and the full-size JPEG, kept on the brokers (see sync/room.js) and fetched
//     only when someone looks at them, so phones don't download the evening's photos again every
//     time they reconnect
// Everything is end-to-end encrypted with the event key, so the brokers only ever hold
// ciphertext. The phone that took a photo keeps its own copy — encrypted the same way — so it can
// put the photo back on a broker that lost it. Other phones keep thumbnails they have fetched (still
// encrypted) so they don't fetch them again, and decrypted photos in memory only.
import { randomId } from '../core/ids.js';
import { getFile, putFile, deleteFile } from '../core/files.js';
import { seal, unseal, unsealBytes } from '../core/crypto.js';
import { photoPrefix } from '../game/photos.js';

export const PHOTO = {
  fullEdge: 1600, // longest side of the full-size photo
  fullMaxBytes: 230_000, // keeps one photo inside one broker message
  thumbEdge: 400,
  thumbMaxBytes: 26_000,
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

// The smallest of the qualities that fits in maxBytes (or the last one tried).
async function jpeg(canvas, qualities, maxBytes) {
  let blob = null;
  for (const q of qualities) {
    blob = await toBlob(canvas, q);
    if (blob && blob.size <= maxBytes) break;
  }
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

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
    const bytes = await jpeg(canvas, [0.86, 0.78, 0.7, 0.62, 0.54], PHOTO.fullMaxBytes);
    if (bytes && bytes.length <= PHOTO.fullMaxBytes) {
      full = bytes;
      size = { w: canvas.width, h: canvas.height };
      break;
    }
  }
  if (!full) return null;
  const thumb = await jpeg(canvasFor(source, sw, sh, PHOTO.thumbEdge, mirror), [0.72, 0.62, 0.52, 0.42], PHOTO.thumbMaxBytes);
  if (!thumb) return null;
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
  const sealed = await room.publishPhoto(name, prepared.thumb, prepared.full);
  show(thumbs, name, prepared.thumb);
  show(fulls, name, prepared.full);
  keep(room, name, sealed);
  return room.append({ t: 'photo', a: name, cap: String(caption || '').trim().slice(0, PHOTO.captionMax), w: prepared.w, h: prepared.h, f: 1, th: 1 });
}

// Your own photo is deleted; anyone else's is hidden (host, or the pub golf judge). Either way it
// leaves every phone and the brokers: the log entry says so for good, and the photo is wiped from
// the brokers right away (the phone that took it drops its own copy when it sees that — see
// dropGoneCopies).
export function removePhoto(room, photo) {
  removePhotos(room, [photo]);
}

// The host clears every photo of the event at once (e.g. the morning after).
export function removePhotos(room, photos) {
  room.appendMany(photos.map((ph) => (ph.pid === room.pid ? { t: 'x', r: ph.id } : { t: 'phide', k: ph.key })));
  for (const ph of photos) {
    if (ph.lazy) room.clearPhoto(ph.pid, ph.asset);
    else {
      // Photos from the first versions: an emptied shared image, and the full size.
      room.setAsset(ph.asset, null);
      if (ph.full) room.clearPhoto(ph.pid, ph.asset);
    }
    if (ph.pid === room.pid) drop(room, ph.asset);
  }
}

// ---------------------------------------------------------------- this phone's own copies
// IndexedDB: `photos:<roomId>` lists the names, `photo:<name>` holds the sealed thumbnail and
// `full:<name>` the sealed full size — encrypted exactly as on the brokers. (The first versions
// kept a sealed shared image — or, the very first, a plain one — under `photo:<name>`.)

const listKey = (room) => `photos:${room.roomId}`;
const kept = new Map(); // roomId -> names of the photos this phone keeps a copy of

async function keep(room, name, sealed) {
  if (!kept.has(room.roomId)) kept.set(room.roomId, new Set());
  kept.get(room.roomId).add(name);
  try {
    await putFile(`photo:${name}`, sealed.thumb);
    await putFile(`full:${name}`, sealed.full);
    const list = (await getFile(listKey(room))) || [];
    await putFile(listKey(room), [...new Set([...list, name])]);
  } catch {
    /* no IndexedDB: the brokers still have it */
  }
}

async function drop(room, name) {
  for (const cache of [thumbs, fulls]) unshow(cache, name);
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

const bytesOf = (v) => (v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null);

// On opening an event: tell the room which photos this phone took (it heals them on brokers that
// lost them), and put back the shared images of photos from the first versions.
export async function restorePhotos(room) {
  room.photoSource = async (name) => {
    try {
      const thumb = bytesOf(await getFile(`photo:${name}`));
      const full = bytesOf(await getFile(`full:${name}`));
      // A first-version copy is a sealed shared image (not a photo): no thumbnail to send.
      return { thumb: thumb?.[0] === 2 ? thumb : null, full };
    } catch {
      return null;
    }
  };
  const lazy = [];
  try {
    const list = (await getFile(listKey(room))) || [];
    kept.set(room.roomId, new Set(list));
    for (const name of list) {
      const copy = await getFile(`photo:${name}`);
      const sealed = bytesOf(copy);
      if (sealed?.[0] === 2) {
        lazy.push(name);
        continue;
      }
      // First versions: the thumbnail was a shared image (the very first kept it unencrypted).
      const asset = sealed ? await unseal(room.key, sealed, `a/${name}`) : copy;
      if (!asset || typeof asset !== 'object') continue;
      room.restoreAsset(name, asset);
      if (!sealed) await putFile(`photo:${name}`, await seal(room.key, asset, `a/${name}`));
    }
  } catch {
    /* no IndexedDB */
  }
  room.setOwnPhotos(lazy);
}

// Our own photos that were deleted or hidden (perhaps on another phone): wipe them from the
// brokers and let go of this phone's copies, so they are never put back.
export function dropGoneCopies(room, d) {
  for (const name of kept.get(room.roomId) || []) {
    const asset = room.state.assets[name];
    if (d.photosGone.has(name) || (asset && !asset.data)) {
      room.clearPhoto(room.pid, name);
      drop(room, name);
    }
  }
}

// Leaving or deleting an event removes this phone's copies of its photos — its own and the
// thumbnails it fetched.
export async function forgetPhotos(roomId) {
  try {
    const key = `photos:${roomId}`;
    for (const name of (await getFile(key)) || []) {
      await deleteFile(`photo:${name}`);
      await deleteFile(`full:${name}`);
    }
    await deleteFile(key);
    for (const name of (await getFile(`thumbs:${roomId}`)) || []) await deleteFile(`thumb:${name}`);
    await deleteFile(`thumbs:${roomId}`);
  } catch {
    /* nothing kept */
  }
}

// ---------------------------------------------------------------------- loading photos
// Decrypted photos live in memory only, as blob URLs, and the oldest are let go.

const thumbs = { map: new Map(), max: 400, busy: 0, queue: [], parallel: 4 };
const fulls = { map: new Map(), max: 24, busy: 0, queue: [], parallel: 2 };

function show(cache, name, bytes) {
  unshow(cache, name);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  cache.map.set(name, { url });
  while (cache.map.size > cache.max) {
    const [oldest, hit] = cache.map.entries().next().value;
    if (hit.promise) break;
    URL.revokeObjectURL(hit.url);
    cache.map.delete(oldest);
  }
  return url;
}

function unshow(cache, name) {
  const hit = cache.map.get(name);
  if (hit?.url) URL.revokeObjectURL(hit.url);
  cache.map.delete(name);
}

async function limited(cache, fn) {
  if (cache.busy >= cache.parallel) await new Promise((resolve) => cache.queue.push(resolve));
  cache.busy++;
  try {
    return await fn();
  } finally {
    cache.busy--;
    cache.queue.shift()?.();
  }
}

// Only ever show a JPEG (FF D8 FF), whatever someone managed to put on a broker.
const isJpeg = (b) => b && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

function load(cache, name, get) {
  const hit = cache.map.get(name);
  if (hit?.url) {
    cache.map.delete(name);
    cache.map.set(name, hit); // most recently used
    return Promise.resolve(hit.url);
  }
  if (hit?.promise) return hit.promise;
  const promise = (async () => {
    const bytes = await get();
    if (!isJpeg(bytes)) {
      cache.map.delete(name);
      return null;
    }
    return show(cache, name, bytes);
  })();
  cache.map.set(name, { promise });
  return promise;
}

export function cachedThumb(photo) {
  return photo.lazy ? thumbs.map.get(photo.asset)?.url || null : photo.thumb;
}

export function cachedFull(photo) {
  return photo.full ? fulls.map.get(photo.asset)?.url || null : cachedThumb(photo);
}

// A blob URL for the thumbnail: our own copy, the copy this phone fetched before, or a broker.
export function loadThumb(room, photo) {
  if (!photo.lazy) return Promise.resolve(photo.thumb);
  const name = photo.asset;
  return load(thumbs, name, async () => {
    const own = photo.pid === room.pid ? (await room.photoSource?.(name))?.thumb : null;
    let cached = own;
    if (!cached) {
      try {
        cached = bytesOf(await getFile(`thumb:${name}`));
      } catch {
        cached = null;
      }
    }
    if (cached) {
      const bytes = await unsealBytes(room.key, cached, `t/${name}`);
      if (bytes) return bytes;
    }
    const got = await limited(thumbs, () => room.fetchThumb(photo.pid, name));
    if (got && isJpeg(got.bytes) && photo.pid !== room.pid) keepThumb(room, name, got.sealed);
    return got?.bytes || null;
  });
}

async function keepThumb(room, name, sealed) {
  try {
    await putFile(`thumb:${name}`, sealed);
    const list = (await getFile(`thumbs:${room.roomId}`)) || [];
    if (!list.includes(name)) await putFile(`thumbs:${room.roomId}`, [...list, name]);
  } catch {
    /* no IndexedDB: fetch it again next time */
  }
}

// A blob URL for the full-size photo, or null if no broker has it right now. Old photos without
// a full-size version are their thumbnail.
export function loadFull(room, photo) {
  if (!photo.full) return loadThumb(room, photo);
  const name = photo.asset;
  return load(fulls, name, async () => {
    if (photo.pid === room.pid) {
      const own = (await room.photoSource?.(name))?.full;
      const bytes = own && (await unsealBytes(room.key, own, `f/${name}`));
      if (bytes) return bytes;
    }
    return limited(fulls, () => room.fetchFull(name));
  });
}

// Closing an event lets go of its decrypted photos.
export function clearPhotoCache() {
  for (const cache of [thumbs, fulls]) {
    for (const hit of cache.map.values()) if (hit.url) URL.revokeObjectURL(hit.url);
    cache.map.clear();
  }
}
