import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch('/api' + path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (r.status === 401 && (await r.clone().json().catch(() => null))?.signIn) window.location.assign('/'); // the session ended: back to the sign-in page
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
