import { useEffect, useState } from 'react';

export type ChangelogEntry = { number: number; title: string; url: string; mergedAt: string };

const SEEN_KEY = 'changelogSeenPRs';

// Browser storage can be blocked (private windows, site data off): the changelog then simply never auto-opens.
function loadSeen(): Set<number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function saveSeen(numbers: Iterable<number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(numbers))); } catch { /* not remembered */ }
}

/** Keeps only well-formed entries that link to https pages (the file is trusted, but the link goes in an <a href>). */
export const cleanEntries = (data: unknown): ChangelogEntry[] =>
  (Array.isArray(data) ? data : []).filter((e): e is ChangelogEntry => !!e && typeof e.number === 'number' && typeof e.title === 'string' && /^https:\/\//.test(String(e.url)));

/** What to pop up: nothing on the very first visit (seen is null: that becomes the baseline), otherwise what has not been seen. */
export const unseen = (list: ChangelogEntry[], seen: Set<number> | null): ChangelogEntry[] => (seen === null ? [] : list.filter((e) => !seen.has(e.number)));

/**
 * Loads changelog.json (made at release time from the merged pull requests) and remembers which ones this browser has
 * seen, as a set rather than a high-water mark because pull requests can merge out of order.
 * The very first visit is taken as the baseline without a pop-up, so nobody is shown the project's whole history.
 * `entries` is the full history (for the manual "What's new" view); `newEntries` is what has appeared since last time.
 */
export function useChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [newEntries, setNewEntries] = useState<ChangelogEntry[]>([]);
  useEffect(() => {
    let live = true;
    fetch('/changelog.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (!live) return;
        const list = cleanEntries(data);
        setEntries(list);
        const seen = loadSeen();
        if (seen === null) saveSeen(list.map((e) => e.number));
        setNewEntries(unseen(list, seen));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const markAllSeen = () => { saveSeen(entries.map((e) => e.number)); setNewEntries([]); };
  return { entries, newEntries, markAllSeen };
}
