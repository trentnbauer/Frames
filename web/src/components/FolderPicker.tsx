import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Modal, Spinner } from './Modal';

type Folder = { id: string; name: string };
type Kids = Folder[] | 'loading' | { error: string };

const ROOT: Record<string, string> = { google: 'root', dropbox: '', onedrive: 'root' };
const TOP = '\u0000top'; // key for the account's top level (Dropbox's root id is '')

/**
 * Option 1a: choose cloud folders in a tree. Folders load one level at a time as you expand them;
 * the search box filters what has been loaded. Ticking a folder includes everything inside it.
 */
export function FolderPicker({ connId, provider, label, account, chosen, onClose, onDone }: {
  connId: string; provider: string; label: string; account?: string; chosen: Folder[];
  onClose: () => void; onDone: (list: Folder[]) => void;
}) {
  const root = ROOT[provider] ?? 'root';
  const [sel, setSel] = useState<Folder[]>(chosen);
  const [kids, setKids] = useState<Record<string, Kids>>({});
  const [parent, setParent] = useState<Record<string, string>>({}); // folder id → parent key
  const [open, setOpen] = useState<string[]>([]);
  const [q, setQ] = useState('');

  const load = async (key: string) => {
    if (kids[key] && kids[key] !== 'loading' && !('error' in (kids[key] as object))) return;
    setKids((k) => ({ ...k, [key]: 'loading' }));
    try {
      const list = await api<Folder[]>(`/cloud/${connId}/folders${key === TOP ? '' : `?parent=${encodeURIComponent(key)}`}`);
      setKids((k) => ({ ...k, [key]: list }));
      setParent((p) => ({ ...p, ...Object.fromEntries(list.map((f) => [f.id, key])) }));
    } catch (e) { setKids((k) => ({ ...k, [key]: { error: (e as Error).message } })); }
  };
  useEffect(() => { void load(TOP); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = (id: string) => Object.values(kids).flatMap((k) => (Array.isArray(k) ? k : [])).find((f) => f.id === id)?.name;
  const ancestors = (id: string) => { const a: string[] = []; let p = parent[id]; while (p && p !== TOP) { a.push(p); p = parent[p]; } return a; };
  const has = (id: string) => sel.some((x) => x.id === id);
  const state = (id: string): 'on' | 'inherited' | 'partial' | 'off' => {
    if (has(id)) return 'on';
    if (has(root) || ancestors(id).some(has)) return 'inherited';
    if (sel.some((s) => ancestors(s.id).includes(id))) return 'partial';
    return 'off';
  };
  const toggle = (f: Folder) => {
    const s = state(f.id);
    if (s === 'inherited') return;
    setSel(s === 'on' ? sel.filter((x) => x.id !== f.id) : [...sel.filter((x) => !ancestors(x.id).includes(f.id)), f]); // a parent replaces its ticked subfolders
  };
  const expand = (id: string) => { if (open.includes(id)) setOpen(open.filter((x) => x !== id)); else { setOpen([...open, id]); void load(id); } };
  const pathOf = (id: string) => ancestors(id).reverse().map((a) => name(a) ?? '…').join(' / ');

  const needle = q.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return null;
    const hit = new Set<string>();
    for (const k of Object.values(kids)) if (Array.isArray(k)) for (const f of k) if (f.name.toLowerCase().includes(needle)) { hit.add(f.id); for (const a of ancestors(f.id)) hit.add(a); }
    return hit;
  }, [needle, kids, parent]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows: ReactNode[] = [];
  const walk = (key: string, depth: number) => {
    const k = kids[key];
    if (k === 'loading' || k === undefined) { rows.push(<div key={`${key}-l`} className="muted" style={{ padding: `7px 8px 7px ${32 + depth * 22}px`, fontSize: 13 }}><Spinner size={12} /> Loading…</div>); return; }
    if (!Array.isArray(k)) { rows.push(<p key={`${key}-e`} className="reason" style={{ paddingLeft: 32 + depth * 22 }}>{k.error}</p>); return; }
    if (k.length === 0 && key === TOP) rows.push(<p key="empty" className="muted" style={{ padding: '12px 8px', margin: 0 }}>No folders in this account.</p>);
    for (const f of k) {
      if (matches && !matches.has(f.id)) continue;
      const loaded = kids[f.id];
      const leaf = Array.isArray(loaded) && loaded.length === 0;
      const isOpen = !leaf && (open.includes(f.id) || (!!matches && Array.isArray(loaded)));
      const s = state(f.id);
      const inside = s === 'partial' ? sel.filter((x) => ancestors(x.id).includes(f.id)).length : 0;
      rows.push(
        <div key={f.id} className="pickrow" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `7px 8px 7px ${8 + depth * 22}px`, borderRadius: 8, minHeight: 36 }}>
          <button aria-label={leaf ? undefined : `${isOpen ? 'Collapse' : 'Expand'} ${f.name}`} aria-expanded={leaf ? undefined : isOpen} disabled={leaf} onClick={() => expand(f.id)} style={{ width: 18, height: 18, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 11, flex: 'none', visibility: leaf ? 'hidden' : 'visible' }}>{isOpen ? '▾' : '▸'}</button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, opacity: s === 'inherited' ? 0.6 : 1, cursor: s === 'inherited' ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={s === 'on' || s === 'inherited'} disabled={s === 'inherited'} onChange={() => toggle(f)} aria-label={f.name} style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
            <Box s={s} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
          </label>
          {s === 'inherited' && <span className="faint" style={{ fontSize: 12 }}>included</span>}
          {inside > 0 && <span className="faint" style={{ fontSize: 12 }}>{inside} inside</span>}
        </div>,
      );
      if (isOpen) walk(f.id, depth + 1);
    }
  };
  walk(TOP, 0);

  const n = sel.length;
  return (
    <Modal title="Choose folders" sub={<>{label}{account ? ` · ${account}` : ''}. Subfolders are included.</>} width={720} onClose={onClose}
      foot={<><span className="grow">{n === 0 ? 'Nothing chosen yet' : `${n} ${n === 1 ? 'folder' : 'folders'} chosen · subfolders included`}</span>
        <button className="btn outline" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={() => onDone(sel)}>Done</button></>}>
      <div className="fpick" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 210px', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <input className="field-in" style={{ height: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a folder" aria-label="Find a folder" />
          {needle && <span className="faint" style={{ fontSize: 12 }}>Searching folders you have opened.</span>}
          <div style={{ height: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!needle && (
              <>
                <label className="pickrow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 30px', borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={has(root)} onChange={() => setSel(has(root) ? sel.filter((x) => x.id !== root) : [{ id: root, name: '' }])} aria-label="Everything in this account" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
                  <Box s={has(root) ? 'on' : 'off'} />
                  <b style={{ fontWeight: 500 }}>Everything in this account</b>
                </label>
                <div style={{ height: 1, background: 'var(--hair)', margin: '4px 0' }} />
              </>
            )}
            {rows}
            {matches && matches.size === 0 && <p className="muted" style={{ padding: '20px 8px', margin: 0, fontSize: 13 }}>No folder called “{q}” in the folders opened so far.</p>}
          </div>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <span className="eyebrow">Will be copied</span>
          {n === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Nothing yet. Tick a folder on the left.</span>}
          {sel.map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid var(--hair)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}>{f.id === root ? 'Everything' : f.name}</div>
                <div className="faint" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{f.id === root ? 'Whole account' : pathOf(f.id) || 'Top level'}</div>
              </div>
              <button className="t2" aria-label={`Stop copying ${f.name || 'the whole account'}`} onClick={() => setSel(sel.filter((x) => x.id !== f.id))}>×</button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function Box({ s }: { s: 'on' | 'inherited' | 'partial' | 'off' }) {
  const on = s === 'on' || s === 'inherited';
  return (
    <span aria-hidden className={`cbox${on ? ' on' : ''}`} style={s === 'partial' ? { boxShadow: 'inset 0 0 0 1px var(--text)', color: 'var(--text)' } : s === 'inherited' ? { opacity: 0.6 } : undefined}>
      {on ? '✓' : s === 'partial' ? '–' : ''}
    </span>
  );
}
