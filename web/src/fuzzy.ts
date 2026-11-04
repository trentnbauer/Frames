const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'onto', 'over', 'under', 'near', 'her', 'his', 'our', 'their', 'at', 'in', 'on', 'of', 'a', 'an', 'to', 'by', 'my', 'is']);

/** birds -> bird, beaches -> beach, cities -> city: enough to match a plural with its singular. */
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('es') && /(ch|sh|x|s|z)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const withinOne = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** The words of a composition's name worth matching: lower case, no filler words. */
export const wordsOf = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s'-]/g, ' ').split(/[\s-]+/).map((w) => w.replace(/'s$/, '').replace(/'/g, '')).filter((w) => w.length >= 3 && !STOP.has(w));

/**
 * Which of the known names does this composition's name point to? "Birds at the Beach" finds the bird and beach ones. A name matches if
 * the whole of it (even several words, like "golden hour") appears in the title, or if one word of the title is the same word (plural or
 * singular) or a near miss of it (one letter out, for words of six letters or more).
 */
export function fuzzyNames(title: string, known: string[]): string[] {
  const text = ` ${wordsOf(title).join(' ')} `;
  const words = wordsOf(title).map(stem);
  if (!words.length) return [];
  return known.filter((k) => {
    const n = k.toLowerCase().trim();
    if (!n) return false;
    if (n.includes(' ') || n.includes('-')) return text.includes(` ${n.replace(/-/g, ' ')} `) || text.includes(` ${n.replace(/[\s-]+/g, ' ')}s `);
    const s = stem(n);
    return words.some((w) => w === s || (w.length >= 6 && s.length >= 6 && withinOne(w, s)));
  });
}
