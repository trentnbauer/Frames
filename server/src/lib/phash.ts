import sharp from 'sharp';

const SIZE = 8; // 8x8 -> 64-bit hash, the classic aHash grid size

// Average hash (aHash): shrink to a tiny grayscale grid, then record per
// pixel whether it's brighter or darker than the grid's mean brightness.
// Crude compared to a DCT-based pHash, but needs no extra dependency (same
// "no k-means library" philosophy as lib/palette.ts) and is plenty
// sensitive to catch near-duplicates — the same frame re-scanned, a
// re-export at different quality/size, a burst-shot twin.
export async function computePerceptualHash(imagePath: string): Promise<string> {
  const { data } = await sharp(imagePath)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (const value of data) sum += value;
  const mean = sum / data.length;

  let bits = '';
  for (const value of data) bits += value >= mean ? '1' : '0';

  // Pack the 64-bit string into 16 hex chars for compact storage.
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

// Count of differing bits between two same-length hex hashes — 0 means
// pixel-for-pixel identical at the 8x8 grayscale level, 64 means inverted.
// Two real photos of the same near-static scene typically land under ~10.
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let nibbleXor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (nibbleXor) {
      distance += nibbleXor & 1;
      nibbleXor >>= 1;
    }
  }
  return distance;
}
