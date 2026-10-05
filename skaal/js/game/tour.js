// Tour de France mode.
//
// - The leader wears the yellow jersey: a Vingegaard-style helmet and glasses (or an image the
//   host uploads) on their picture everywhere in the app, so everyone can see who leads.
// - When a rider reaches 21 drinks (the Tour has 21 stages) one of three faces pops up on every
//   phone, and what happens depends on which face it is. The Tour song plays in the background.
//
// Change names, texts or effects here; pictures of the faces are uploaded by the host in the
// event settings (the app ships with drawn defaults).

export const TOUR = {
  stages: 21,
  // A moment pops up on phones that see it within this long; afterwards it is only in the feed.
  momentMs: 45_000,
};

export const TOUR_HINT = 'Føreren får den gule trøje på sit billede, og ved 21 drinks dukker et ansigt op';

// Shared images (see Room#setAsset).
export const TOUR_ASSETS = {
  mask: 'tour-mask',
  face: (id) => `tour-face-${id}`,
};

// `effects(ctx)` returns the log entries that make the face's effect happen. ctx:
//   near    the riders closest to the rider in the standings (behind first, then in front)
//   rival   nearest rival: the rider just in front, or — for the leader — just behind
//   bonus   whether the host allows bonus points
export const TOUR_FACES = [
  {
    id: 'henning',
    name: 'Henning Primdahl',
    title: 'Massestart!',
    text: () => 'Hele feltet skåler for rytteren — alle drikker 2 slurke.',
    color: '#ef4444',
    effects: () => [
      { t: 'all', n: 2 },
      { t: 'self', n: 2 },
    ],
  },
  {
    id: 'bobby',
    name: 'Bobby',
    title: 'Baghjul!',
    text: () => 'De to nærmeste ryttere i feltet skal have baghjul — de drikker 3 slurke hver.',
    color: '#60a5fa',
    effects: ({ near }) => near.slice(0, 2).map((pid) => ({ t: 'pen', to: pid, n: 3, u: 'sip' })),
  },
  {
    id: 'pimm',
    name: 'Pimm',
    title: 'Udbrud!',
    text: ({ bonus }) =>
      bonus
        ? 'Rytteren stikker af: +3 point i tidsbonus, og den nærmeste rival drikker 3 slurke.'
        : 'Rytteren stikker af — den nærmeste rival drikker 3 slurke.',
    color: '#22c55e',
    effects: ({ rival, bonus }) => [
      ...(bonus ? [{ t: 'bon', n: 3 }] : []),
      ...(rival ? [{ t: 'pen', to: rival, n: 3, u: 'sip' }] : []),
    ],
  },
];

const BY_ID = new Map(TOUR_FACES.map((f) => [f.id, f]));

export function faceById(id) {
  return BY_ID.get(id) || null;
}

// The standings around a rider, used by the face effects.
export function tourContext(d, pid) {
  const order = d.ranking.filter((p) => !p.left && !p.paused).map((p) => p.pid);
  const i = order.indexOf(pid);
  const behind = i >= 0 ? order.slice(i + 1) : order.filter((x) => x !== pid);
  const ahead = i > 0 ? order.slice(0, i).reverse() : [];
  return {
    near: [...behind, ...ahead],
    rival: (i === 0 ? behind[0] : ahead[0]) || null,
    bonus: !!d.settings.bonus,
  };
}

// Has the rider just reached the finish? Fires once per rider, on the drink that takes them to
// 21 (or on their next drink, if the host switched the mode on after they passed it).
export function reachesFinish({ after, me, alcoholic }) {
  if (!after.settings.tour || after.ended || !alcoholic) return false;
  const p = after.players.get(me);
  if (!p || p.alcoholic < TOUR.stages) return false;
  return !after.tour.moments.some((m) => m.pid === me);
}

// Song links: web addresses only (or a path on this site).
export function cleanSongUrl(value) {
  const s = String(value || '').trim().slice(0, 500);
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^[\w./-]+$/.test(s) && !s.startsWith('//')) return s;
  return '';
}

// A link straight to an audio file can play in the background; anything else (Spotify,
// YouTube …) is opened with a button instead.
export function isAudioUrl(url) {
  return /\.(mp3|m4a|aac|ogg|oga|opus|wav|webm|flac)([?#].*)?$/i.test(url || '');
}
