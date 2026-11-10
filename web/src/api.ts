import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch('/api' + path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (r.status === 401 && (await r.clone().json().catch(() => null))?.signIn) window.location.assign(`/signin?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); // the session ended: back to the sign-in page
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  return r.json() as Promise<T>;
}

/** Fetches `path` (null = skip). `reload` refetches; `set` updates local data after a write. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let live = true;
    setError(null);
    api<T>(path).then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: data === null && error === null, reload, set: setData };
}

/** A photo's image. On a share page the guest's own link token is used instead of the login. */
/**
 * The address of a photograph's picture. The `r` is the version of how pictures are kept: older versions let a browser keep a picture for a day
 * under its address alone, so after an upgrade a browser could still hold another photograph's picture under the same number. Changing this number
 * makes every browser fetch fresh ones once (the server now checks them every time, so it is only needed for pictures kept before that).
 */
const IMG_REV = 2;
export const imgUrl = (id: number, kind: 'thumb' | 'preview', share?: string) => `${share ? `/api/s/${share}/photos/${id}/${kind}` : `/api/photos/${id}/${kind}`}?r=${IMG_REV}`;

/** Opens the person's own portfolio in a new tab: their own web address if they set one, else their /name/, else /portfolio/. The tab opens first so a pop-up blocker allows it. */
export async function openPortfolio() {
  const w = window.open('', '_blank');
  if (!w) return;
  w.opener = null;
  try {
    const d = await api<{ config: { host: string }; handle: string }>('/portfolio');
    const h = d.config.host;
    w.location.href = h ? `${/^localhost(:|$)/.test(h) ? 'http' : 'https'}://${h}/` : d.handle ? `/${d.handle}/` : '/portfolio/';
  } catch { w.location.href = '/portfolio/'; }
}
