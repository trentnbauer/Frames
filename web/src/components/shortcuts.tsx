import { useEffect, useRef } from 'react';
import { Modal } from './Modal';

/** One keyboard shortcut of the screen being shown. `off` hides it (the button it belongs to is not there). */
export type Shortcut = { key: string; label: string; run: () => void; off?: boolean };

const sources = new Set<() => Shortcut[]>();
/** What the open screen answers to, for the "?" list. */
export const currentShortcuts = () => [...sources].flatMap((g) => g()).filter((s) => !s.off);

const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable); };
const onKey = (e: KeyboardEvent) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target) || document.querySelector('[role=dialog]')) return;
  for (const g of sources) {
    const s = g().find((x) => !x.off && x.key.toLowerCase() === e.key.toLowerCase());
    if (s) { e.preventDefault(); s.run(); return; }
  }
};

/** For screens that are classes: register a function that returns the current list; call the result to stop. */
export function addShortcuts(get: () => Shortcut[]): () => void {
  if (!sources.size) window.addEventListener('keydown', onKey);
  sources.add(get);
  return () => { sources.delete(get); if (!sources.size) window.removeEventListener('keydown', onKey); };
}

/**
 * Shortcuts for one screen. They are ignored while typing, with Ctrl/Cmd/Alt held, and while a dialog is open.
 * Keys are compared without case ("a" and "A"); arrows are "ArrowLeft" and "ArrowRight".
 */
export function useShortcuts(list: Shortcut[]) {
  const ref = useRef(list);
  ref.current = list;
  useEffect(() => addShortcuts(() => ref.current), []);
}

/** The little key beside a button's label: the key that does the same thing. */
export const Kbd = ({ k }: { k: string }) => <kbd className="kbd" aria-hidden="true">{k}</kbd>;

const GLOBAL: [string, string][] = [['R', 'Review'], ['/', 'Search'], ['⌘ K', 'Search'], ['?', 'This list'], ['Esc', 'Close a dialog']];
const KEYNAME: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→' };

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const here = currentShortcuts();
  const row = (k: string, label: string) => <div key={k + label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--hair)', fontSize: 14 }}><span>{label}</span><kbd className="kbd" style={{ marginLeft: 0 }}>{k}</kbd></div>;
  return (
    <Modal title="Keyboard shortcuts" sub="They work when you are not typing in a box." width={420} onClose={onClose} foot={<><span className="grow" /><button className="btn" onClick={onClose}>Done</button></>}>
      {here.length > 0 && <div style={{ marginBottom: 14 }}><div className="eyebrow" style={{ marginBottom: 4 }}>On this page</div>{here.map((s) => row(KEYNAME[s.key] ?? s.key.toUpperCase(), s.label))}</div>}
      <div className="eyebrow" style={{ marginBottom: 4 }}>Everywhere</div>
      {GLOBAL.map(([k, l]) => row(k, l))}
    </Modal>
  );
}
