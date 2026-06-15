/**
 * Mulberry32 — fast deterministic PRNG.
 * Returns a function () => number in [0, 1).
 *
 *   const r = createRandom(12345);
 *   r(); // 0.233
 */
export function createRandom(seed: number): () => number {
  if (seed === undefined) throw new Error('createRandom: seed is required');
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(1e8 * Math.random()) || randomSeed();
}
