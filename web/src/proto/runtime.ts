import { createContext, useContext, type CSSProperties } from 'react';

/** Turns the design's inline style string (with bindings already filled in) into a React style object. */
const cache = new Map<string, CSSProperties>();
export function st(s: unknown): CSSProperties {
  const key = String(s ?? '');
  const hit = cache.get(key);
  if (hit) return hit;
  const o: Record<string, string> = {};
  let cur = '', depth = 0, quote = '';
  const flush = () => {
    const i = cur.indexOf(':');
    if (i > 0) {
      let k = cur.slice(0, i).trim(); const val = cur.slice(i + 1).trim();
      if (k.startsWith('--')) o[k] = val;
      else { if (k.startsWith('-')) k = k.slice(1); o[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()).replace(/^webkit/, 'Webkit').replace(/^moz/, 'Moz')] = val; }
    }
    cur = '';
  };
  for (const ch of key) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { flush(); continue; }
    cur += ch;
  }
  flush();
  if (cache.size > 2000) cache.clear();
  cache.set(key, o as CSSProperties);
  return o as CSSProperties;
}

/** What the design's `data-go="screen"` does: go to that screen. The shell supplies the map from the design's names to routes. */
export const GoContext = createContext<(to: string) => void>(() => undefined);
export const useGo = () => {
  const go = useContext(GoContext);
  return (to: unknown) => { if (typeof to === 'string' && to) go(to); };
};
