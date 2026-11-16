import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loading } from '../components/bits';
import { useStore } from '../store';
import { LIB_MOVED, NAMES, ROWS, parseAddress, type Tab } from './addresses';
import { GroupView, visibleRows, useToast, type Section } from './ui';
import { LIB, SRV, type Ctx, type SectionDef, type TabDef } from './sections';

const mono = "'IBM Plex Mono',monospace";

export function SettingsPage() {
  const { me, settings } = useStore();
  const isAdmin = me?.role === 'admin';
  const params = new URLSearchParams(window.location.search);
  const start = parseAddress(params);
  const [tab, setTab] = useState<Tab>(start.tab);
  const [sec, setSec] = useState<Record<Tab, string>>({ lib: start.tab === 'lib' && start.key ? start.key : 'account', srv: start.tab === 'srv' && start.key ? start.key : 'signin' });
  // The tab open inside each section that has tabs, by "tab:section".
  const [subs, setSubs] = useState<Record<string, string>>(start.sub ? { [`${start.tab}:${start.key}`]: start.sub } : {});
  const [q, setQ] = useState('');
  const [toast, setToast] = useToast();
  const [modal, setModal] = useState<ReactNode>(null);
  const shownTab: Tab = tab === 'srv' && !isAdmin ? 'lib' : tab;
  const defs = shownTab === 'lib' ? LIB : SRV;
  const cur = defs.find((d) => d.key === sec[shownTab]) ?? defs[0];

  const curSub = cur.tabs ? (cur.tabs.find((x) => x.key === subs[`${cur.tab}:${cur.key}`]) ?? cur.tabs[0]).key : undefined;

  useEffect(() => {
    const u = new URL(window.location.href); u.searchParams.set('tab', shownTab); u.searchParams.set('section', cur.key);
    if (curSub) u.searchParams.set('sub', curSub); else u.searchParams.delete('sub');
    u.searchParams.delete('access'); u.searchParams.delete('cloud'); window.history.replaceState(null, '', u);
  }, [shownTab, cur.key, curSub]);

  const goto = (t: Tab, key: string, sub?: string) => {
    // A section that was merged into another opens in its new place, on the tab its settings moved to.
    const moved = t === 'lib' ? LIB_MOVED[key] : undefined;
    const k = moved ? moved[0] : key, s2 = sub ?? moved?.[1];
    setQ(''); setTab(t); setSec((s) => ({ ...s, [t]: k }));
    if (s2) setSubs((m) => ({ ...m, [`${t}:${k}`]: s2 }));
  };
  // A link to another section while this page is already open (the "Settings out of sync" banner, for one) changes the address but not
  // this page's state, so follow it.
  const loc = useLocation();
  const opened = useRef(true);
  useEffect(() => {
    if (opened.current) { opened.current = false; return; }
    const want = parseAddress(new URLSearchParams(loc.search));
    if (want.key) goto(want.tab, want.key, want.sub);
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx: Ctx = useMemo(() => ({ toast: setToast, modal: setModal, goto, me, isAdmin: !!isAdmin }), [me, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const hits = needle ? ROWS.filter((r) => (isAdmin || r.tab === 'lib') && `${r.label} ${r.hint} ${NAMES.get(`${r.tab}:${r.sec}`)} ${r.g}`.toLowerCase().includes(needle)) : [];
  // Each section (and, inside one, each tab) that has a matching setting.
  const hitViews = needle ? [...LIB, ...(isAdmin ? SRV : [])].flatMap((d): { def: SectionDef; sub?: string }[] => {
    const mine = hits.filter((h) => h.tab === d.tab && h.sec === d.key);
    if (!mine.length) return [];
    if (!d.tabs) return [{ def: d }];
    return d.tabs.filter((x) => mine.some((h) => !h.sub || h.sub === x.key)).map((x) => ({ def: d, sub: x.key }));
  }) : [];

  if (!settings) return <div className="page settings-page"><Loading /></div>;
  return (
    <div className="page settings-page" style={{ paddingBottom: 140 }}>

      <div className="settings-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 12, maxWidth: 1028, marginInline: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1, margin: 0 }}>Settings</h1>
          <span role="status" aria-live="polite" style={{ fontSize: 13, color: 'var(--text2)', opacity: toast ? 1 : 0, transition: 'opacity .25s ease' }}>✓ {toast || 'Saved'}</span>
        </div>
        {isAdmin && (
          <div role="tablist" aria-label="Scope" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--surface)', fontSize: 13.5 }}>
            {([['lib', <>Your library</>], ['srv', <>Server <span style={{ color: 'var(--muted)' }}>· admin</span></>]] as [Tab, ReactNode][]).map(([k, label]) => (
              <span key={k} role="tab" aria-selected={shownTab === k} tabIndex={0} onClick={() => { setQ(''); setTab(k); }} onKeyDown={(e) => { if (e.key === 'Enter') { setQ(''); setTab(k); } }}
                style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', background: shownTab === k ? 'var(--chip)' : 'transparent', color: shownTab === k ? 'var(--text)' : 'var(--text2)' }}>{label}</span>
            ))}
          </div>
        )}
      </div>
      <div className="settings-wrap" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 48, maxWidth: 1028, marginInline: 'auto' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, color: 'var(--text2)', alignSelf: 'start' }}>
          <div style={{ height: 36, borderRadius: 999, background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', marginBottom: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a setting" aria-label="Find a setting" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', font: "400 13px 'IBM Plex Sans',sans-serif", boxShadow: 'none', padding: 0, borderRadius: 0 }} />
            {q && <span role="button" tabIndex={0} aria-label="Clear" onClick={() => setQ('')} style={{ color: 'var(--muted)', cursor: 'pointer' }}>✕</span>}
          </div>
          {defs.map((d) => {
            const on = !needle && d.key === cur.key;
            return (
              <span key={d.key} role="button" tabIndex={0} aria-current={on ? 'page' : undefined} onClick={() => goto(shownTab, d.key)} onKeyDown={(e) => { if (e.key === 'Enter') goto(shownTab, d.key); }} className="snavi"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--hair)' : 'transparent', color: on ? 'var(--text)' : 'var(--text2)' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>{d.name}{d.sub && <span style={{ fontSize: 11.5, lineHeight: 1.3, color: 'var(--faint)' }}>{d.sub}</span>}</span><span style={{ font: `400 11px ${mono}`, color: 'var(--muted)' }}>{d.badge ?? ''}</span>
              </span>
            );
          })}
        </aside>
        <main style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760, minWidth: 0 }}>
          {needle ? (
            <>
              <div><h2 className="serif" style={{ fontSize: 32, lineHeight: 1, margin: '0 0 6px', fontWeight: 400 }}>Results for “{q.trim()}”</h2><p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>{hits.length} {hits.length === 1 ? 'setting' : 'settings'} across both tabs</p></div>
              {hits.length === 0 && <div style={{ padding: 24, borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontSize: 13.5 }}>No settings match. Try “review”, “XMP” or “backup”.</div>}
              {hitViews.map(({ def: d, sub }) => <SectionView key={`${d.tab}:${d.key}:${sub ?? ''}`} def={d} sub={sub} ctx={ctx} filter={needle} onJump={() => goto(d.tab, d.key, sub)} />)}
            </>
          ) : <SectionView key={`${cur.tab}:${cur.key}`} def={cur} sub={curSub} onSub={(k) => setSubs((m) => ({ ...m, [`${cur.tab}:${cur.key}`]: k }))} ctx={ctx} />}
        </main>
      </div>
      {modal}
    </div>
  );
}

/** Calls the section's own hook (so only the section on show loads its data) and draws its cards. */
function SectionView({ def, sub, onSub, ctx, filter, onJump }: { def: SectionDef; sub?: string; onSub?: (key: string) => void; ctx: Ctx; filter?: string; onJump?: () => void }) {
  const tabDef = def.tabs ? (def.tabs.find((t) => t.key === sub) ?? def.tabs[0]) : undefined;
  // Keyed by tab so a tab's hook (and only that one) runs while it is on show.
  return <SectionBody key={tabDef?.key ?? ''} use={(tabDef?.use ?? def.use)!} def={def} tabDef={tabDef} onSub={onSub} ctx={ctx} filter={filter} onJump={onJump} />;
}

function SectionBody({ use, def, tabDef, onSub, ctx, filter, onJump }: { use: (ctx: Ctx) => Section; def: SectionDef; tabDef?: TabDef; onSub?: (key: string) => void; ctx: Ctx; filter?: string; onJump?: () => void }) {
  const s: Section = use(ctx);
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => s.groups.flatMap((g) => g.rows), [s]);
  const vis = visibleRows(all);
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open]);
  if (filter) {
    const rows = all.filter((r) => vis(r) && `${typeof r.label === 'string' ? r.label : ''} ${typeof r.hint === 'string' ? r.hint : ''} ${s.name} ${s.groups.find((g) => g.rows.includes(r))?.title ?? ''}`.toLowerCase().includes(filter));
    if (!rows.length) return null;
    return <>{open && <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />}<GroupView g={{ rows }} vis={() => true} open={open} setOpen={setOpen} title={(def.tabs ? `${def.name} · ${tabDef!.label}` : s.name) + (def.tab === 'srv' ? ' · Server' : '')} jump={onJump} /></>;
  }
  return (
    <>
      {open && <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div><h2 className="serif" style={{ fontSize: 32, lineHeight: 1, margin: '0 0 6px', fontWeight: 400 }}>{def.tabs ? def.name : s.name}</h2><p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>{s.hint}</p></div>
        {s.action && <span role="button" tabIndex={0} onClick={s.action.act} onKeyDown={(e) => { if (e.key === 'Enter') s.action!.act(); }} className="sact" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px', borderRadius: 999, background: 'var(--text)', color: 'var(--bg)', fontWeight: 500, fontSize: 14.5, cursor: 'pointer', flex: 'none', boxShadow: '0 6px 18px rgba(0,0,0,.35)' }}>{s.action.label}</span>}
      </div>
      {def.tabs && (
        <div role="tablist" aria-label={`${def.name} tabs`} className="seg" style={{ alignSelf: 'flex-start' }}>
          {def.tabs.map((t) => <button key={t.key} role="tab" aria-selected={t.key === tabDef!.key} className={t.key === tabDef!.key ? 'on' : ''} onClick={() => onSub?.(t.key)}>{t.label}</button>)}
        </div>
      )}
      {def.tab === 'srv' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--chip)', fontSize: 13, color: 'var(--text2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text)' }} />Changes here apply to everyone on this server.</div>}
      {s.notice && <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'var(--err-bg)', fontSize: 13, color: 'var(--err)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--err)', flex: 'none', marginTop: 6 }} /><span>{s.notice}</span></div>}
      {s.groups.map((g, i) => <GroupView key={i} g={g} vis={vis} open={open} setOpen={setOpen} />)}
      {s.after}
    </>
  );
}
