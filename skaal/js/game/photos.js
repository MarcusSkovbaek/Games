// Photos from the evening, for every kind of event. Pure derivation from the logs (see
// app/photos.js for taking, storing and loading them).
//
//   photo  { a, cap, w, h, f, th }  a photo named a. th = 1: its thumbnail is fetched when needed
//                                (see sync/room.js); without th it is the shared image `a` (photos
//                                from the first versions). f = 1: there is a full-size version.
//   pc     { k, txt }            a comment on photo k
//   phide  { k }                 hide photo or comment k — the host (and in pub golf the judge at
//                                the time)
//   pghide { k }                 the same, as written by the first pub golf version
//
// Deleting your own photo or comment voids its entry ({ t: 'x' }).

// Photos are shared images named after their owner, so only the owner's log can claim them.
export const photoPrefix = (pid) => `ph-${String(pid).slice(0, 16)}-`;
export const COMMENT_MAX = 200;

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const dim = (v) => (Number.isFinite(v) && v > 0 && v < 20000 ? Math.round(v) : 0);

// `list(type)` gives the valid log entries of a type in time order (see derive.js); `canHide(pid,
// ts)` says whether pid could hide other people's photos at that time; `voided` the photo entries
// deleted by their owner (as [pid, entry]). `gone` names the photos that were deleted or hidden —
// the phone that took one lets go of its copy. `comments` has each photo's comments, oldest first.
export function derivePhotos({ list, assets = {}, canHide, voided = [] }) {
  const hidden = new Set();
  for (const type of ['phide', 'pghide']) {
    for (const { pid, e } of list(type)) if (typeof e.k === 'string' && canHide(pid, e.ts)) hidden.add(e.k);
  }
  const gone = new Set();
  for (const { pid, e } of voided) if (typeof e.a === 'string' && e.a.startsWith(photoPrefix(pid))) gone.add(e.a);
  const photos = [];
  for (const { pid, e } of list('photo')) {
    const key = `${pid}:${e.id}`;
    if (typeof e.a !== 'string' || !e.a.startsWith(photoPrefix(pid))) continue;
    if (hidden.has(key)) {
      gone.add(e.a);
      continue;
    }
    const lazy = e.th === 1;
    const asset = lazy ? null : assets[e.a];
    if (asset && !asset.data) continue; // deleted by the one who took it (first versions)
    photos.push({ key, id: e.id, pid, asset: e.a, lazy, thumb: asset?.data || null, full: e.f === 1, cap: str(e.cap, 140), w: dim(e.w), h: dim(e.h), ts: e.ts });
  }
  photos.sort((a, b) => b.ts - a.ts);
  const photoByKey = new Map(photos.map((ph) => [ph.key, ph]));
  const comments = new Map();
  for (const { pid, e } of list('pc')) {
    const key = `${pid}:${e.id}`;
    const txt = str(e.txt, COMMENT_MAX);
    if (!txt || typeof e.k !== 'string' || !photoByKey.has(e.k) || hidden.has(key)) continue;
    if (!comments.has(e.k)) comments.set(e.k, []);
    comments.get(e.k).push({ key, id: e.id, pid, photo: e.k, txt, ts: e.ts });
  }
  return { photos, photoByKey, comments, gone };
}
