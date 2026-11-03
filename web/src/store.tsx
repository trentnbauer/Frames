import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { PHOTOS } from './data';

export type Settings = {
  sessions: number;
  intervals: string[];
  adaptive: boolean;
  archiveSuggest: boolean;
  ai: 'off' | 'local' | 'external';
  aiEndpoint: string;
};
export type ReviewState = { queue: number[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };

const DEFAULTS: Settings = {
  sessions: 6,
  intervals: ['1 day', '1 week', '1 month', '3 months', '6 months', '1 year'],
  adaptive: true,
  archiveSuggest: false,
  ai: 'local',
  aiEndpoint: 'Ollama at 192.168.1.20',
};

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: state just won't persist */
  }
}

export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

type Ctx = {
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  review: ReviewState | null;
  setReview: (r: ReviewState | null) => void;
  dueCount: number;
};
const C = createContext<Ctx>(null!);
export const useStore = () => useContext(C);

export const DUE_IDS = PHOTOS.slice(0, 48).map((p) => p.id);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setS] = useState<Settings>(() => ({ ...DEFAULTS, ...load<Partial<Settings>>('frames.settings', {}) }));
  const [review, setR] = useState<ReviewState | null>(() => load<ReviewState | null>('frames.review', null));
  useEffect(() => save('frames.settings', settings), [settings]);
  useEffect(() => save('frames.review', review), [review]);
  const dueCount = review ? Math.max(0, review.queue.length - review.index) : DUE_IDS.length;
  return (
    <C.Provider value={{ settings, setSettings: (s) => setS((o) => ({ ...o, ...s })), review, setReview: setR, dueCount }}>
      {children}
    </C.Provider>
  );
}
