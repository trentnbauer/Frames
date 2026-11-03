import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export type Settings = {
  sessions: number; intervals: string[]; adaptive: boolean; archiveSuggest: boolean;
  ai: 'off' | 'local' | 'external'; aiActive: string;
  xmpWriteBack: boolean;
};
export type Summary = { due: number; resumable: boolean; nextId: number | null; shootNames: string[]; total: number; minutes: number; sessions: number };

export type Me = { mode: 'none' | 'password' | 'oauth'; user: { name: string; email: string; provider: string } | null; canSignOut: boolean };

type Ctx = {
  me: Me | null;
  refreshMe: () => void;
  settings: Settings | null;
  setSettings: (s: Partial<Settings>) => Promise<void>;
  summary: Summary | null;
  refreshSummary: () => void;
};
const C = createContext<Ctx>(null!);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setS] = useState<Settings | null>(null);
  const [summary, setSum] = useState<Summary | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const refreshMe = useCallback(() => { api<Me>('/me').then(setMe).catch(() => {}); }, []);
  const refreshSummary = useCallback(() => { api<Summary>('/review/summary').then(setSum).catch(() => {}); }, []);
  useEffect(() => {
    // A share link's page has no login, and these calls need one: skip them there, or the browser asks a guest for a password.
    if (window.location.pathname.startsWith('/s/')) return;
    api<Me>('/me').then(setMe).catch(() => {});
    api<{ settings: Settings }>('/settings').then((r) => setS(r.settings)).catch(() => {});
    refreshSummary();
  }, [refreshSummary]);
  const setSettings = async (p: Partial<Settings>) => {
    setS(await api<Settings>('/settings', { method: 'PUT', body: p }));
    refreshSummary();
  };
  return <C.Provider value={{ me, refreshMe, settings, setSettings, summary, refreshSummary }}>{children}</C.Provider>;
}
