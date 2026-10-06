// Photos from the evening, for every kind of event. Pure derivation from the logs (see
// app/photos.js for taking, storing and loading them).
//
//   photo  { a, cap, w, h, f, th, ds }  a photo named a. th = 1: its thumbnail is fetched when
//                                needed (see sync/room.js); without th it is the shared image `a`
//                                (photos from the first versions). f = 1: there is a full-size
//                                version. ds = 1: taken with the disposable camera (see DISPOSABLE).
//   pc     { k, txt }            a comment on photo k
//   phide  { k }                 hide photo or comment k — the host (and in pub golf the judge at
//                                the time)
//   pghide { k }                 the same, as written by the first pub golf version
//
// Deleting your own photo or comment voids its entry ({ t: 'x' }).

// Photos are shared images named after their owner, so only the owner's log can claim them.
export const photoPrefix = (pid) => `ph-${String(pid).slice(0, 16)}-`;
export const COMMENT_MAX = 200;

// The disposable camera (an event setting): nobody sees what they shoot, everyone has 23 shots,
// and a photo develops — shows up for everyone, the one who took it included — 24 hours after it
// was taken. Every phone holds to this: a shot past the 23rd is never shown, and neither is a photo
// before it has developed. A shot that is deleted later has still used up its frame.
export const DISPOSABLE = { shots: 23, developMs: 24 * 3600_000 };

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const dim = (v) => (Number.isFinite(v) && v > 0 && v < 20000 ? Math.round(v) : 0);

// `list(type)` gives the valid log entries of a type in time order (see derive.js); `canHide(pid,
// ts)` says whether pid could hide other people's photos at that time; `voided` the photo entries
// deleted by their owner (as { pid, e }); `t` the time now. `gone` names the photos that were
// deleted or hidden — the phone that took one lets go of its copy. `comments` has each photo's
// comments, oldest first. A photo's `shown` is when it showed up: when it was taken, or for the
// disposable camera when it developed. `undeveloped` has the photos still developing (next first),
// `shots` how many frames of the disposable camera each player has used.
export function derivePhotos({ list, assets = {}, canHide, voided = [], t = 0 }) {
  const hidden = new Set();
  for (const type of ['phide', 'pghide']) {
    for (const { pid, e } of list(type)) if (typeof e.k === 'string' && canHide(pid, e.ts)) hidden.add(e.k);
  }
  const gone = new Set();
  for (const { pid, e } of voided) if (typeof e.a === 'string' && e.a.startsWith(photoPrefix(pid))) gone.add(e.a);
  // The disposable camera's frames, in the order they were shot (deleted shots included).
  const shots = new Map();
  const frame = new Map();
  const film = [...list('photo'), ...voided].filter(({ e }) => e.ds === 1).sort((a, b) => a.e.ts - b.e.ts || (a.e.id < b.e.id ? -1 : 1));
  for (const { pid, e } of film) {
    shots.set(pid, (shots.get(pid) || 0) + 1);
    frame.set(`${pid}:${e.id}`, shots.get(pid));
  }
  for (const [pid, n] of shots) shots.set(pid, Math.min(n, DISPOSABLE.shots));
  const photos = [];
  const undeveloped = [];
  for (const { pid, e } of list('photo')) {
    const key = `${pid}:${e.id}`;
    if (typeof e.a !== 'string' || !e.a.startsWith(photoPrefix(pid))) continue;
    const ds = e.ds === 1;
    if (hidden.has(key) || (ds && frame.get(key) > DISPOSABLE.shots)) {
      gone.add(e.a);
      continue;
    }
    const lazy = e.th === 1;
    const asset = lazy ? null : assets[e.a];
    if (asset && !asset.data) continue; // deleted by the one who took it (first versions)
    const shown = ds ? e.ts + DISPOSABLE.developMs : e.ts;
    const photo = { key, id: e.id, pid, asset: e.a, lazy, thumb: asset?.data || null, full: e.f === 1, cap: str(e.cap, 140), w: dim(e.w), h: dim(e.h), ts: e.ts, ds, shown };
    (t < shown ? undeveloped : photos).push(photo);
  }
  photos.sort((a, b) => b.ts - a.ts);
  undeveloped.sort((a, b) => a.shown - b.shown);
  const photoByKey = new Map(photos.map((ph) => [ph.key, ph]));
  const comments = new Map();
  for (const { pid, e } of list('pc')) {
    const key = `${pid}:${e.id}`;
    const txt = str(e.txt, COMMENT_MAX);
    if (!txt || typeof e.k !== 'string' || !photoByKey.has(e.k) || hidden.has(key)) continue;
    if (!comments.has(e.k)) comments.set(e.k, []);
    comments.get(e.k).push({ key, id: e.id, pid, photo: e.k, txt, ts: e.ts });
  }
  return { photos, photoByKey, comments, gone, undeveloped, shots };
}

// Photos shared in a row by the same person (several from the camera roll at once, a burst at the
// bar) are one item in the feed: up to 12, each within 3 minutes of the one before. A single photo
// stays an item of its own (its reactions are the photo's likes). Photos from the disposable camera
// are in the feed from when they developed, apart from the others.
export const SET_GAP_MS = 3 * 60_000;
const SET_MAX = 12;

export function photoFeedItems(photos) {
  const sets = [];
  let cur = null;
  const at = (ph) => ph.shown ?? ph.ts;
  for (const ph of [...photos].sort((a, b) => at(a) - at(b))) {
    if (cur && cur.pid === ph.pid && !!cur.photos[0].ds === !!ph.ds && at(ph) - cur.ts < SET_GAP_MS && cur.photos.length < SET_MAX) {
      cur.photos.push(ph);
      cur.ts = at(ph);
    } else {
      cur = { pid: ph.pid, ts: at(ph), photos: [ph] };
      sets.push(cur);
    }
  }
  return sets.map(({ pid, ts, photos: list }) =>
    list.length === 1
      ? { key: list[0].key, ts, kind: 'photo', pid, photo: list[0] }
      : { key: `set:${list[0].key}`, ts, kind: 'photos', pid, photos: list },
  );
}
