import { useSyncExternalStore } from 'react';

/** Changes being applied in the background (Edit details on many photographs), shown in the header beside the AI indicator. */
type State = { kind: 'busy' | 'done' | 'error'; text: string } | null;
let state: State = null;
const listeners = new Set<() => void>();
const set = (next: State) => { state = next; listeners.forEach((l) => l()); };
let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Runs `work` with the header showing its progress; it reports "N of M" through `progress`. Never throws: an error stays on show. */
export async function runApplying(label: string, work: (progress: (text: string) => void) => Promise<unknown>): Promise<boolean> {
  clearTimeout(clearTimer);
  set({ kind: 'busy', text: label });
  try {
    await work((p) => set({ kind: 'busy', text: `${label} · ${p}` }));
    set({ kind: 'done', text: 'Changes applied' });
    clearTimer = setTimeout(() => set(null), 4000);
    return true;
  } catch (e) {
    set({ kind: 'error', text: `Changes not applied: ${(e as Error).message}` });
    clearTimer = setTimeout(() => set(null), 12000);
    return false;
  }
}

export function ApplyStatus() {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
  if (!s) return null;
  return (
    <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', borderRadius: 999, fontSize: 12.5, whiteSpace: 'nowrap', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', background: s.kind === 'error' ? 'var(--err-bg)' : 'var(--surface)', color: s.kind === 'error' ? 'var(--err)' : 'var(--text2)' }}>
      {s.kind === 'busy' ? <span className="spin" style={{ width: 12, height: 12, flex: 'none' }} aria-hidden /> : <span aria-hidden>{s.kind === 'done' ? '✓' : '!'}</span>}
      {s.text}
    </span>
  );
}
