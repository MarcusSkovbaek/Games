// Deterministic randomness. Every device computes the same automatic breakers from the same
// seed, so no coordinator is needed to decide which minigame runs next.

export function hashString(str) {
  // cyrb53-style 32-bit hash (stable across JS engines).
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export function seededRandom(seed) {
  // mulberry32
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helpers that work with any () => [0,1) source, seeded or cryptographic.
export function pickIndex(rand, length) {
  return Math.min(length - 1, Math.floor(rand() * length));
}

export function pick(rand, list) {
  return list.length ? list[pickIndex(rand, list.length)] : undefined;
}

export function pickWeighted(rand, list, weightOf = (x) => x.weight ?? 1) {
  const total = list.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) return undefined;
  let r = rand() * total;
  for (const item of list) {
    r -= Math.max(0, weightOf(item));
    if (r < 0) return item;
  }
  return list[list.length - 1];
}

export function shuffle(rand, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = pickIndex(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick an index from [0, size) avoiding `used` when possible.
export function pickFresh(rand, size, used = []) {
  const usedSet = new Set(used);
  const fresh = [];
  for (let i = 0; i < size; i++) if (!usedSet.has(i)) fresh.push(i);
  return fresh.length ? pick(rand, fresh) : pickIndex(rand, size);
}
