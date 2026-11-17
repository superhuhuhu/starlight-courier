// A small seeded random generator (mulberry32) so every level's stars, shards and comet
// phases are the same on every load. Deterministic levels make the game fair to replay and
// the screenshots reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A value in [min, max) from a generator.
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// An integer in [min, max] from a generator.
export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Pick one element of an array.
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}
