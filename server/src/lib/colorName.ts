// Maps a hex color to one plain-English name — used to turn a photo's
// extracted dominant colors into taggable words (see addColorTags in
// ingest.ts). Deliberately coarse: a small, stable vocabulary that reads
// like something a person would type as a tag, not a precise color-science
// classification.
export function hexToColorName(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l >= 0.94) return 'white';
  if (l <= 0.08) return 'black';
  if (s <= 0.12) return 'gray';
  if (h < 15 || h >= 345) return l < 0.4 ? 'brown' : 'red';
  if (h < 45) return l < 0.35 ? 'brown' : 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 200) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  if (h < 345) return 'pink';
  return 'red';
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}
