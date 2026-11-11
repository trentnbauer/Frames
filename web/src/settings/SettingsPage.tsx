import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Header, Loading } from '../components/bits';
import { useStore } from '../store';
import proto from './proto.json';
import { GroupView, visibleRows, useToast, type Section } from './ui';
import { LIB, SRV, type Ctx, type SectionDef } from './sections';

type Tab = 'lib' | 'srv';
type Idx = { tab: Tab; sec: string; id: string; g: string; label: string; hint: string };
const ROWS = proto.rows as Idx[];
const NAMES = new Map((proto.sections as { tab: Tab; key: string; name: string }[]).map((s) => [`${s.tab}:${s.key}`, s.name]));
const mono = "'IBM Plex Mono',monospace";

/** The addresses the old Settings pages used, so a link or a bookmark still lands in the right place. */
const OLD: Record<string, [Tab, string]> = {
  profile: ['lib', 'profile'], notifications: ['lib', 'notifications'], reviews: ['lib', 'reviews'], 'tags-subjects': ['lib', 'tags'], 'metadata-xmp': ['lib', 'xmp'], ai: ['lib', 'ai'], 'cloud-sync': ['lib', 'cloud'], portfolio: ['lib', 'portfolio'], 'your-data': ['lib', 'data'], 'sign-in-methods': ['lib', 'profile'],
  access: ['srv', 'signin'], 'sign-in-access': ['srv', 'signin'], people: ['srv', 'people'], members: ['srv', 'people'], 'libraries-storage': ['srv', 'folders'], 'photos-storage': ['srv', 'folders'], 'cloud-services': ['srv', 'folders'], backup: ['srv', 'backup'], 'shared-ai': ['srv', 'srvai'],
  'cloudflare-tunnel': ['srv', 'network'], email: ['srv', 'email'], 'env-file': ['srv', 'server'], 'storage-processing': ['srv', 'processing'], 'updates-system': ['srv', 'server'], about: ['srv', 'server'],
};

export function SettingsPage() {
  const { me, settings } = useStore();
  const isAdmin = me?.role === 'admin';
  const params = new URLSearchParams(window.location.search);
  const start = (() => {
    const s = params.get('section') ?? '';
    const t = params.get('tab');
    if (t === 'srv' || t === 'lib') return { tab: t as Tab, key: s };
    const o = OLD[s]; if (o) return { tab: o[0], key: o[1] };
    if (params.has('access')) return { tab: 'srv' as Tab, key: 'signin' };
    if (params.has('cloud')) return { tab: 'lib' as Tab, key: 'cloud' };
    return { tab: 'lib' as Tab, key: s };
  })();
  const [tab, setTab] = useState<Tab>(start.tab);
  const [sec, setSec] = useState<Record<Tab, string>>({ lib: start.tab === 'lib' && start.key ? start.key : 'profile', srv: start.tab === 'srv' && start.key ? start.key : 'signin' });
  const [q, setQ] = useState('');
  const [toast, setToast] = useToast();
  const [modal, setModal] = useState<ReactNode>(null);
  const shownTab: Tab = tab === 'srv' && !isAdmin ? 'lib' : tab;
  const defs = shownTab === 'lib' ? LIB : SRV;
  const cur = defs.find((d) => d.key === sec[shownTab]) ?? defs[0];

  useEffect(() => { const u = new URL(window.location.href); u.searchParams.set('tab', shownTab); u.searchParams.set('section', cur.key); u.searchParams.delete('access'); u.searchParams.delete('cloud'); window.history.replaceState(null, '', u); }, [shownTab, cur.key]);

  const goto = (t: Tab, key: string) => { setQ(''); setTab(t); setSec((s) => ({ ...s, [t]: key })); };
  const ctx: Ctx = useMemo(() => ({ toast: setToast, modal: setModal, goto, me, isAdmin: !!isAdmin }), [me, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const hits = needle ? ROWS.filter((r) => (isAdmin || r.tab === 'lib') && `${r.label} ${r.hint} ${NAMES.get(`${r.tab}:${r.sec}`)} ${r.g}`.toLowerCase().includes(needle)) : [];
  const hitSecs = needle ? [...LIB, ...(isAdmin ? SRV : [])].filter((d) => hits.some((h) => h.tab === d.tab && h.sec === d.key)) : [];

  if (!settings) return <div className="page"><Header /><Loading /></div>;
  return (
    <div className="page" style={{ paddingBottom: 140 }}>
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1, margin: 0 }}>Settings</h1>
          <span role="status" aria-live="polite" style={{ fontSize: 13, color: '#a8a59f', opacity: toast ? 1 : 0, transition: 'opacity .25s ease' }}>✓ {toast || 'Saved'}</span>
        </div>
        {isAdmin && (
          <div role="tablist" aria-label="Scope" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: '#161615', fontSize: 13.5 }}>
            {([['lib', <>Your library</>], ['srv', <>Server <span style={{ color: '#6f6c67' }}>· admin</span></>]] as [Tab, ReactNode][]).map(([k, label]) => (
              <span key={k} role="tab" aria-selected={shownTab === k} tabIndex={0} onClick={() => { setQ(''); setTab(k); }} onKeyDown={(e) => { if (e.key === 'Enter') { setQ(''); setTab(k); } }}
                style={{ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', background: shownTab === k ? 'rgba(255,255,255,.1)' : 'transparent', color: shownTab === k ? '#efede8' : '#a8a59f' }}>{label}</span>
            ))}
          </div>
        )}
      </div>
      <div className="settings-wrap" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 48 }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, color: '#a8a59f', alignSelf: 'start' }}>
          <div style={{ height: 36, borderRadius: 999, background: '#161615', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', marginBottom: 12 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a setting" aria-label="Find a setting" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: '#efede8', font: "400 13px 'IBM Plex Sans',sans-serif", boxShadow: 'none', padding: 0, borderRadius: 0 }} />
            {q && <span role="button" tabIndex={0} aria-label="Clear" onClick={() => setQ('')} style={{ color: '#6f6c67', cursor: 'pointer' }}>✕</span>}
          </div>
          {defs.map((d) => {
            const on = !needle && d.key === cur.key;
            return (
              <span key={d.key} role="button" tabIndex={0} aria-current={on ? 'page' : undefined} onClick={() => goto(shownTab, d.key)} onKeyDown={(e) => { if (e.key === 'Enter') goto(shownTab, d.key); }} className="snavi"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: on ? 'rgba(255,255,255,.08)' : 'transparent', color: on ? '#efede8' : '#a8a59f' }}>
                {d.name}<span style={{ font: `400 11px ${mono}`, color: '#6f6c67' }}>{d.badge ?? ''}</span>
              </span>
            );
          })}
        </aside>
        <main style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 760, minWidth: 0 }}>
          {needle ? (
            <>
              <div><h2 className="serif" style={{ fontSize: 32, lineHeight: 1, margin: '0 0 6px', fontWeight: 400 }}>Results for “{q.trim()}”</h2><p style={{ margin: 0, fontSize: 13.5, color: '#8f8c86' }}>{hits.length} {hits.length === 1 ? 'setting' : 'settings'} across both tabs</p></div>
              {hits.length === 0 && <div style={{ padding: 24, borderRadius: 12, background: '#161615', color: '#8f8c86', fontSize: 13.5 }}>No settings match. Try “review”, “XMP” or “backup”.</div>}
              {hitSecs.map((d) => <SectionView key={`${d.tab}:${d.key}`} def={d} ctx={ctx} filter={needle} onJump={() => goto(d.tab, d.key)} />)}
            </>
          ) : <SectionView key={`${cur.tab}:${cur.key}`} def={cur} ctx={ctx} />}
        </main>
      </div>
      {modal}
    </div>
  );
}

/** Calls the section's own hook (so only the section on show loads its data) and draws its cards. */
function SectionView({ def, ctx, filter, onJump }: { def: SectionDef; ctx: Ctx; filter?: string; onJump?: () => void }) {
  const s: Section = def.use(ctx);
  const [open, setOpen] = useState<string | null>(null);
  const all = useMemo(() => s.groups.flatMap((g) => g.rows), [s]);
  const vis = visibleRows(all);
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [open]);
  if (filter) {
    const rows = all.filter((r) => vis(r) && `${typeof r.label === 'string' ? r.label : ''} ${typeof r.hint === 'string' ? r.hint : ''} ${s.name} ${s.groups.find((g) => g.rows.includes(r))?.title ?? ''}`.toLowerCase().includes(filter));
    if (!rows.length) return null;
    return <>{open && <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />}<GroupView g={{ rows }} vis={() => true} open={open} setOpen={setOpen} title={s.name + (def.tab === 'srv' ? ' · Server' : '')} jump={onJump} /></>;
  }
  return (
    <>
      {open && <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 5 }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div><h2 className="serif" style={{ fontSize: 32, lineHeight: 1, margin: '0 0 6px', fontWeight: 400 }}>{s.name}</h2><p style={{ margin: 0, fontSize: 13.5, color: '#8f8c86' }}>{s.hint}</p></div>
        {s.action && <span role="button" tabIndex={0} onClick={s.action.act} onKeyDown={(e) => { if (e.key === 'Enter') s.action!.act(); }} className="sact" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 22px', borderRadius: 999, background: '#efede8', color: '#0d0d0d', fontWeight: 500, fontSize: 14.5, cursor: 'pointer', flex: 'none', boxShadow: '0 6px 18px rgba(0,0,0,.35)' }}>{s.action.label}</span>}
      </div>
      {def.tab === 'srv' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)', fontSize: 13, color: '#a8a59f' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#efede8' }} />Changes here apply to everyone on this server.</div>}
      {s.notice && <div role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 10, background: 'rgba(231,140,120,.1)', fontSize: 13, color: '#e79a82' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e79a82', flex: 'none', marginTop: 6 }} /><span>{s.notice}</span></div>}
      {s.groups.map((g, i) => <GroupView key={i} g={g} vis={vis} open={open} setOpen={setOpen} />)}
      {s.after}
    </>
  );
}
