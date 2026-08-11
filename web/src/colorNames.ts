// Mirrors the closed vocabulary hexToColorName (server/src/lib/colorName.ts)
// can produce — used client-side to give a photo's automatic dominant-color
// tags a distinct look (a swatch dot, no confirm step) instead of blending
// in with real subject tags. Name-based, not note-based: several render
// sites (the Library filter bar, a project card's aggregated tags) only
// ever see a bare tag name, not the per-photo link that carries the
// "dominant color" note.
export const COLOR_TAG_NAMES = new Set([
  'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'gray',
]);
