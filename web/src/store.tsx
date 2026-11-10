import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type Settings = {
  sessions: number; intervals: string[]; adaptive: boolean; archiveSuggest: boolean; deleteBelow: number; todoReasons: string[]; gear?: { camera: string; lens: string; medium: '' | 'digital' | 'film'; film: string };
  ai: 'off' | 'local' | 'external'; aiActive: string;
  xmpWriteBack: boolean;
};
export type Summary = { due: number; resumable: boolean; early: number; nextId: number | null; shootNames: string[]; total: number; minutes: number; sessions: number };

export type Me = { mode: 'none' | 'password' | 'oauth'; user: { name: string; email: string; provider: string; folder: string } | null; id: number; owner: boolean; role: 'admin' | 'member' | 'guest'; canSignOut: boolean; displayName?: string; hasAvatar?: boolean; cloudOnly?: boolean; signups: boolean; envConfig: boolean };

type Ctx = {
  me: Me | null;
  refreshMe: () => void;
  settings: Settings | null;
  setSettings: (s: Partial<Settings>) => Promise<void>;
  summary: Summary | null;
  refreshSummary: () => void;
  /** How many things are waiting on the person; 0 hides the To do button. */
  todo: number;
};
const C = createContext<Ctx>(null!);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setS] = useState<Settings | null>(null);
  const [summary, setSum] = useState<Summary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [todo, setTodo] = useState(0);
  const refreshMe = useCallback(() => { api<Me>('/me').then(setMe).catch(() => {}); }, []);
  const refreshSummary = useCallback(() => { api<Summary>('/review/summary').then(setSum).catch(() => {}); api<{ total: number }>('/todo').then((t) => setTodo(t.total)).catch(() => {}); }, []);
  useEffect(() => {
    // A share link's page has no login, and these calls need one: skip them there, or the browser asks a guest for a password.
    if (window.location.pathname.startsWith('/s/') || /^\/(signin|signup|signed-out|terms)\/?$/.test(window.location.pathname)) return;
    api<Me>('/me').then(setMe).catch(() => {});
    api<{ settings: Settings }>('/settings').then((r) => setS(r.settings)).catch(() => {});
    refreshSummary();
  }, [refreshSummary]);
  const setSettings = async (p: Partial<Settings>) => {
    setS(await api<Settings>('/settings', { method: 'PUT', body: p }));
    refreshSummary();
  };
  return <C.Provider value={{ me, refreshMe, settings, setSettings, summary, refreshSummary, todo }}>{children}</C.Provider>;
}
