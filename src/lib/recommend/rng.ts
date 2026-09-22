/**
 * Seeded RNG for the autofill planner (W9a). Determinism is the product:
 * same seed → identical shell, so the RNG lives in its own module where
 * tests pin the sequence. Mulberry32 — tiny, fast, good-enough dispersion
 * for weighted sampling; never for anything security-adjacent.
 */

/** 32-bit seeded generator; returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Efraimidis–Spirakis weighted sampling without replacement: key = u^(1/w)
 * per item, take the n largest. Consumes exactly one `rand()` per item (in
 * input order), so a fixed seed and a fixed pool give a fixed result.
 */
export function sampleWeighted<T>(
  items: readonly T[],
  n: number,
  weightOf: (item: T) => number,
  rand: () => number,
): T[] {
  if (n <= 0) return [];
  const keyed = items.map((item, i) => ({
    item,
    i,
    key: Math.pow(rand(), 1 / Math.max(weightOf(item), 1e-9)),
  }));
  keyed.sort((a, b) => b.key - a.key || a.i - b.i);
  return keyed.slice(0, Math.min(n, keyed.length)).map((k) => k.item);
}
