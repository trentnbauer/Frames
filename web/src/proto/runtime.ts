import { createContext, useContext, useEffect, useReducer, useRef, type CSSProperties } from 'react';

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

/** The design's `DCLogic` base class, as a plain class a React component drives: `state`, `setState`, `props`, lifecycle hooks, `renderVals()`. */
export class DCLogic {
  state: Record<string, any> = {};
  props: Record<string, any> = {};
  __update: () => void = () => undefined;
  setState(update: any, cb?: () => void) {
    const n = typeof update === 'function' ? update(this.state, this.props) : update;
    if (n) this.state = { ...this.state, ...n };
    this.__update();
    cb?.();
  }
  componentDidMount?(): void;
  componentWillUnmount?(): void;
  renderVals(): Record<string, any> { return {}; }
}
export function useDCLogic<T extends DCLogic>(Ctor: new () => T, props: Record<string, any>): Record<string, any> {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<T | null>(null);
  if (!ref.current) { ref.current = new Ctor(); ref.current.__update = () => force(); }
  const inst = ref.current;
  inst.props = props;
  useEffect(() => { inst.componentDidMount?.(); return () => inst.componentWillUnmount?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return inst.renderVals();
}
