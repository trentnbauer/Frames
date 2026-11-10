import { useCallback, useEffect, useState } from 'react';
import { api, useApi } from '../api';

export type Prefs = Record<string, string | number | boolean | string[]>;

/**
 * The settings that are kept but do nothing on their own yet, one set for the person and one for the whole server. They save as they
 * are changed (the screen updates at once) and come back after a reload.
 */
export function usePrefs(scope: 'user' | 'server') {
  const path = scope === 'user' ? '/prefs' : '/admin/prefs';
  const d = useApi<{ prefs: Prefs }>(path);
  const [local, setLocal] = useState<Prefs>({});
  useEffect(() => { if (d.data) setLocal({}); }, [d.data]);
  const get = useCallback(<T,>(id: string, def: T): T => (id in local ? (local[id] as unknown as T) : d.data && id in d.data.prefs ? (d.data.prefs[id] as unknown as T) : def), [local, d.data]);
  const set = useCallback((id: string, v: string | number | boolean | string[]) => {
    setLocal((l) => ({ ...l, [id]: v }));
    api(path, { method: 'PUT', body: { [id]: v } }).catch(() => d.reload());
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return { get, set, ready: !!d.data };
}

/** Saves a value to a path, then refreshes what was read. Never throws: a failure reloads the true value. */
export function useSaver(reload: () => void, toast: (m: string) => void) {
  return useCallback(async (path: string, body: unknown, method: 'PUT' | 'POST' | 'PATCH' = 'PUT') => {
    try { await api(path, { method, body }); toast('Saved'); } catch (e) { toast((e as Error).message); }
    reload();
  }, [reload, toast]);
}
