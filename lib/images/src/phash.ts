import sharp from "sharp";

/**
 * Size of the DCT input grid. We resize the image to 32×32 grayscale before
 * running a 2D DCT-II and take the top-left 8×8 block as the perceptual hash
 * basis. 32 is the canonical pHash grid size; smaller grids lose enough
 * frequency information that visually distinct images collide more often.
 */
const DCT_GRID = 32;

/**
 * The pHash basis is the top-left 8×8 block of DCT coefficients.
 */
const HASH_BLOCK = 8;

/**
 * Compute an 8×8-DCT perceptual hash for the supplied image bytes.
 *
 * Algorithm (Requirement 2.7, design "perceptual hash via sharp greyscale +
 * 8×8 DCT"):
 *   1. Resize to a 32×32 grayscale raw buffer (sharp `fit: 'fill'`).
 *   2. Apply a 2D DCT-II via separable row + column 1D DCTs.
 *   3. Take the top-left 8×8 = 64 coefficients (low-frequency content).
 *   4. Compute the median across the 63 non-DC coefficients.
 *   5. For each of the 64 coefficients, emit a bit set iff the coefficient
 *      is greater than the median. The DC coefficient is included so the
 *      hash is exactly 64 bits — its bit is deterministic for any fixed
 *      median sign and contributes negligibly to discrimination.
 *   6. Pack the 64 bits big-endian into 8 bytes and return as a 16-character
 *      lowercase hex string.
 *
 * The result is suitable as the `image_perceptual_hash` field on `scans` and
 * as the deterministic neutral-fallback seed consumed by the scoring engine.
 */
export async function computePerceptualHash(bytes: Buffer): Promise<string> {
  const raw = await sharp(bytes)
    .resize(DCT_GRID, DCT_GRID, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();

  // raw is N*N bytes (greyscale, 1 channel) regardless of source format.
  const pixels = new Float64Array(DCT_GRID * DCT_GRID);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = raw[i]!;
  }

  const dct = dct2d(pixels, DCT_GRID);

  // Extract the top-left 8×8 block (low-frequency signal).
  const block = new Float64Array(HASH_BLOCK * HASH_BLOCK);
  for (let y = 0; y < HASH_BLOCK; y++) {
    for (let x = 0; x < HASH_BLOCK; x++) {
      block[y * HASH_BLOCK + x] = dct[y * DCT_GRID + x]!;
    }
  }

  // Median across non-DC coefficients (DC is index 0; it dominates magnitude
  // and would otherwise skew the threshold).
  const sorted = Array.from(block.slice(1)).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  // Pack 64 bits → 8 bytes, MSB first.
  const out = Buffer.alloc(8);
  for (let i = 0; i < 64; i++) {
    if (block[i]! > median) {
      out[i >> 3]! |= 1 << (7 - (i & 7));
    }
  }

  return out.toString("hex");
}

/**
 * Separable 2D DCT-II. Runs a 1D DCT across each row, then across each
 * column of the intermediate result. O(N^3); on a 32×32 grid this is
 * ~32_768 cosine evaluations per axis — well under a millisecond and dwarfed
 * by the libvips decode upstream.
 */
function dct2d(input: Float64Array, n: number): Float64Array {
  const rowResult = new Float64Array(n * n);
  const row = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) row[x] = input[y * n + x]!;
    const dctRow = dct1d(row);
    for (let x = 0; x < n; x++) rowResult[y * n + x] = dctRow[x]!;
  }

  const result = new Float64Array(n * n);
  const col = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) col[y] = rowResult[y * n + x]!;
    const dctCol = dct1d(col);
    for (let y = 0; y < n; y++) result[y * n + x] = dctCol[y]!;
  }

  return result;
}

/**
 * Naïve DCT-II for 1D arrays. Sufficient at N=32; we trade an O(N log N)
 * fast DCT for code that is trivially auditable and produces byte-stable
 * output across V8 versions (the property tested via `Property 14:
 * Anomaly Determinism` and friends in the scoring tests).
 */
function dct1d(input: Float64Array): Float64Array {
  const n = input.length;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += input[i]! * Math.cos((Math.PI * (2 * i + 1) * k) / (2 * n));
    }
    out[k] = sum;
  }
  return out;
}
