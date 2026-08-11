import sharp from 'sharp';

// Dominant-color extraction — a lightweight quantize-and-count instead of
// full k-means: downsample the image small (cheap, decode time dominates
// anyway), bucket pixels into a coarse RGB grid, average each bucket's
// actual pixel values (not the bucket's own center) so the result stays a
// real color from the photo, and return the biggest buckets by pixel
// count, most-dominant first — the same "what's actually in this frame"
// ordering Lomography's color-bar strips use.
const SAMPLE_SIZE = 64;
const BUCKET_STEP = 24;

export async function extractPalette(imagePath: string, count = 6): Promise<string[]> {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();

  for (let i = 0; i + channels <= data.length; i += channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r / BUCKET_STEP | 0}-${g / BUCKET_STEP | 0}-${b / BUCKET_STEP | 0}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map(({ r, g, b, n }) => rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
