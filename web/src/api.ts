import { demoApi, demoAssets, demoImage } from './demo/api';
import { useCallback, useEffect, useState } from 'react';

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (import.meta.env.VITE_FRAMES_DEMO === 'true') return demoApi<T>(path, init);
  const r = await fetch('/api' + path, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (r.status === 401 && (await r.clone().json().catch(() => null))?.signIn) window.location.assign(`/signin?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`); // the session ended: back to the sign-in page
  if (r.status === 403 && (await r.clone().json().catch(() => null))?.mfaRequired) window.dispatchEvent(new Event('frames:mfa-required'));
  if (!r.ok) throw new Error((await r.json().catch(() => ({ error: r.statusText }))).error ?? r.statusText);
  const data = await r.json();
  if ((init?.body !== undefined || init?.method === 'DELETE') && typeof data?.operationId === 'number') window.dispatchEvent(new CustomEvent('frames:undo-available',{detail:{id:data.operationId}}));
  return data as T;
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
  useEffect(()=>{window.addEventListener('frames:metadata-changed',reload);return()=>window.removeEventListener('frames:metadata-changed',reload);},[reload]);
  return { data, error, loading: data === null && error === null, reload, set: setData };
}

/** A photo's image. On a share page the guest's own link token is used instead of the login. */
/**
 * The address of a photograph's picture. The `r` is the version of how pictures are kept: older versions let a browser keep a picture for a day
 * under its address alone, so after an upgrade a browser could still hold another photograph's picture under the same number. Changing this number
 * makes every browser fetch fresh ones once (the server now checks them every time, so it is only needed for pictures kept before that).
 */
const IMG_REV = 2;
/** Photographs turned in this tab: their pictures get a new address so the browser does not keep showing the old way round. */
const turned = new Map<number, number>();
export const imageChanged = (id: number) => { turned.set(id, Date.now()); };
export const imgUrl = (id: number, kind: 'thumb' | 'preview', share?: string) => import.meta.env.VITE_FRAMES_DEMO === 'true' ? demoImage(id, kind) : `${share ? `/api/s/${share}/photos/${id}/${kind}` : `/api/photos/${id}/${kind}`}?r=${IMG_REV}${turned.has(id) ? `&t=${turned.get(id)}` : ''}`;

/** The room picture behind a composition's wall. */
export const roomUrl = (id: number, v: number) => import.meta.env.VITE_FRAMES_DEMO === 'true' ? demoAssets.room : `/api/collections/${id}/background?v=${v}`;

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

/** Hands each original to the browser's own downloader, in print order. The files are never altered. */
export async function downloadOriginals(ids: number[]) {
  const pad = String(ids.length).length;
  for (let i = 0; i < ids.length; i++) {
    const a = document.createElement('a');
    a.href = `/api/photos/${ids[i]}/original?n=${i + 1}&pad=${pad}`; a.download = '';
    document.body.appendChild(a); a.click(); a.remove();
    await new Promise((r) => setTimeout(r, 450)); // browsers drop downloads fired in the same instant
  }
}
