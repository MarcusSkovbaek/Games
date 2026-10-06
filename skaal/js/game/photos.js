// Photos from the evening, for every kind of event. Pure derivation from the logs (see
// app/photos.js for taking, storing and loading them).
//
//   photo  { a, cap, w, h, f }   a photo: thumbnail in shared image `a`; f = 1 when there is a
//                                full-size version (older pub golf photos are the thumbnail only)
//   phide  { k }                 hide photo k — the host (and in pub golf the judge at the time)
//   pghide { k }                 the same, as written by the first pub golf version
//
// Deleting your own photo voids its entry ({ t: 'x' }) and empties the thumbnail.

// Photos are shared images named after their owner, so only the owner's log can claim them.
export const photoPrefix = (pid) => `ph-${String(pid).slice(0, 16)}-`;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const dim = (v) => (Number.isFinite(v) && v > 0 && v < 20000 ? Math.round(v) : 0);

// `list(type)` gives the valid log entries of a type in time order (see derive.js); `canHide(pid,
// ts)` says whether pid could hide other people's photos at that time.
export function derivePhotos({ list, assets = {}, canHide }) {
  const hidden = new Set();
  for (const type of ['phide', 'pghide']) {
    for (const { pid, e } of list(type)) if (typeof e.k === 'string' && canHide(pid, e.ts)) hidden.add(e.k);
  }
  const photos = [];
  for (const { pid, e } of list('photo')) {
    const key = `${pid}:${e.id}`;
    if (hidden.has(key) || typeof e.a !== 'string' || !e.a.startsWith(photoPrefix(pid))) continue;
    const asset = assets[e.a];
    if (asset && !asset.data) continue; // deleted by the one who took it
    photos.push({ key, id: e.id, pid, asset: e.a, thumb: asset?.data || null, full: e.f === 1, cap: str(e.cap, 140), w: dim(e.w), h: dim(e.h), ts: e.ts });
  }
  photos.sort((a, b) => b.ts - a.ts);
  return { photos, photoByKey: new Map(photos.map((ph) => [ph.key, ph])) };
}
