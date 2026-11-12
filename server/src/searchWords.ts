const CONNECTORS = new Set(['at', 'in', 'near']);

/** Natural connectors join the subject and place; they are not words every photo must contain. Standalone queries stay literal. */
export function searchWords(query: string): string[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.filter((word, i) => {
    if (i === 0 || i === words.length - 1) return true;
    if (CONNECTORS.has(word)) return false;
    return !(word === 'the' && i > 1 && CONNECTORS.has(words[i - 1]));
  });
}
