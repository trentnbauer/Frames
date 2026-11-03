import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch('/api' + path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
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

export const imgUrl = (id: number, kind: 'thumb' | 'preview') => `/api/photos/${id}/${kind}`;
