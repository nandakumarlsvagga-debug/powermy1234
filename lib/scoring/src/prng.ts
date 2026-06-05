/**
 * `mulberry32` — a small, deterministic 32-bit PRNG.
 *
 * Vendored here (rather than pulled from npm) so the scoring engine has
 * zero runtime dependencies and so its determinism is auditable in-tree.
 * The implementation is the well-known reference from Tommy Ettinger's
 * public-domain pseudo-random number generator.
 *
 * Given the same seed, the returned generator emits the same sequence of
 * floats in `[0, 1)`. This is the determinism boundary that the anomaly
 * draw and the fallback commentary picker both rely on.
 */
export function mulberry32(seed: number): () => number {
  // Coerce to a 32-bit unsigned integer so the caller can pass any number.
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
