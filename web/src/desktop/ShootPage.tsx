import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { SharePanel } from '../components/SharePanel';
import type { PhotoLite, Shoot } from '../data';
import { reviewUrl } from '../reviewScope';
import { useStore } from '../store';
import { useUi } from '../ui';
import { ConfirmDialog, JustifiedGrid, Lock, PickedBar, isDue, serif, useToast } from './parts';
import { isUntitled } from './LibraryPage';

const mono = "'IBM Plex Mono',monospace";
const key = { font: `400 11px ${mono}`, opacity: 0.55 } as const;

/** One photoshoot on a wide screen (the design): title, place, dates and camera, Protect, Share, Review, Compose, a menu, four numbers and the photographs. */
export function ShootPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [, setSp] = useSearchParams();
  const { openNew } = useUi();
  const { refreshSummary } = useStore();
  const shoot = useApi<Shoot>(`/shoots/${id}`);
  const list = useApi<{ photos: PhotoLite[] }>(`/photos?shoot=${id}`);
  const all = useApi<Shoot[]>('/shoots');
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  const s = shoot.data;
  const photos = list.data?.photos ?? [];
  const due = photos.filter(isDue);
  const ref = useRef({ review: () => {}, compose: () => {} });
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') setSelecting((v) => { if (v) setPicked(new Set()); return !v; });
      else if (k === 'r') { ref.current.review(); e.stopPropagation(); }
      else if (k === 'c') ref.current.compose();
      else if (e.key === 'Escape') { setMenu(false); setSelecting(false); setPicked(new Set()); }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, []);
  if (!s) return <div className="page-shell">{shoot.error ? <p role="alert" className="muted">Something went wrong: {shoot.error}</p> : <p className="muted">Loading…</p>}</div>;
  ref.current = { review: () => { if (due.length) nav(reviewUrl(due.map((p) => p.id))); }, compose: () => openNew({ name: s.name, photoIds: photos.map((p) => p.id) }) };
  const title = s.name.trim() || 'Untitled shoot';
  const reviewed = photos.filter((p) => p.reviewCount > 0 && !isDue(p)).length;
  const loved = photos.filter((p) => p.avgRating >= 4.5).length;
  const protect = async (on: boolean) => { setErr(''); setMenu(false); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { protected: on } }); shoot.reload(); toast.say(on ? `“${title}” is protected from deletion` : 'Protection turned off'); } catch (e) { setErr((e as Error).message); } };
  const saveName = async () => { const v = name.trim(); setRenaming(false); if (!v || v === s.name) return; try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { name: v } }); shoot.reload(); } catch (e) { setErr((e as Error).message); } };
  const remove = async () => { setConfirm(false); try { await api(`/shoots/${s.id}`, { method: 'DELETE' }); refreshSummary(); nav('/library', { replace: true }); } catch (e) { setErr((e as Error).message); } };
  const flip = (pid: number) => setPicked((c) => { const n = new Set(c); if (n.has(pid)) n.delete(pid); else n.add(pid); return n; });
  const pill = { display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14, whiteSpace: 'nowrap' } as const;
  const menuItems: { label: string; sub?: string; fg?: string; sep?: boolean; go: () => void }[] = [
    { label: 'Share…', go: () => { setMenu(false); setSharing(true); } },
    ...(picked.size === 1 ? [{ label: 'Make the selected photograph the cover', go: async () => { setMenu(false); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { coverId: [...picked][0] } }); shoot.reload(); toast.say('Cover changed'); } catch (e) { setErr((e as Error).message); } } }] : []),
    { label: 'Use the highest rated photograph as the cover', go: async () => { setMenu(false); try { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { coverId: null } }); shoot.reload(); toast.say('The cover is the highest rated photograph'); } catch (e) { setErr((e as Error).message); } } },
    { label: 'Rename shoot', go: () => { setMenu(false); setName(s.name); setRenaming(true); } },
    { label: 'Edit place, dates and camera…', go: () => { setMenu(false); setSp({ adv: '1' }); } },
    { label: s.protected ? 'Turn off protection' : 'Protect from deletion', go: () => protect(!s.protected) },
    { sep: true, label: 'Delete shoot…', sub: s.protected ? 'Protected. Turn off protection to delete it.' : `Moves all ${photos.length} photographs to Recently removed.`, fg: s.protected ? 'var(--faint)' : 'var(--danger)', go: () => { setMenu(false); if (s.protected) toast.say('This shoot is protected. Turn off protection to delete it.'); else setConfirm(true); } },
  ];
  const cam = s.gear?.camera || photos.find((p) => p.camera)?.camera || '';

  return (
    <div className="page-shell" data-screen-label="Shoot" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div><button onClick={() => nav('/library')} style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 999, color: 'var(--text2)', fontSize: 13.5, background: 'var(--hover)' }}>← Library</button></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '20px 32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {renaming
            ? <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setRenaming(false); }} aria-label="Shoot name" maxLength={120} style={{ font: `400 48px/1.05 ${serif}`, background: 'transparent', border: 0, borderBottom: '1px solid var(--outline)', outline: 'none', color: 'var(--text)', minWidth: 320 }} />
            : <h1 onClick={() => { setName(s.name); setRenaming(true); }} title="Click to rename" style={{ font: `400 48px/1.05 ${serif}`, margin: 0, color: isUntitled(s) ? 'var(--text2)' : 'var(--text)', cursor: 'text', overflowWrap: 'anywhere' }}>{title}</h1>}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 13.5, color: 'var(--muted)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
            <span style={{ color: 'var(--text2)' }}>{s.place || 'Add a location'}</span><span>· {s.dates}{cam ? ' ·' : ''}</span>
            {cam && <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg><span>{cam}</span></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => protect(!s.protected)} aria-pressed={!!s.protected} title={s.protected ? 'Protected from deletion · click to turn off' : 'Stop this shoot and its photos from being deleted'} style={{ ...pill, padding: '0 16px 0 14px', background: s.protected ? 'var(--chip)' : 'transparent', boxShadow: s.protected ? 'none' : 'inset 0 0 0 1px var(--outline)' }}><Lock open={!s.protected} />{s.protected ? 'Protected' : 'Protect'}</button>
          <button onClick={() => setSharing(true)} style={pill}>Share</button>
          <button onClick={() => ref.current.review()} disabled={!due.length} style={{ ...pill, opacity: due.length ? 1 : 0.5 }}>{due.length ? `Review · ${due.length} due` : 'Nothing due'}<span style={{ ...key, color: 'var(--faint)' }}>R</span></button>
          <button onClick={() => ref.current.compose()} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 48, padding: '0 24px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15, whiteSpace: 'nowrap' }}>Compose from this shoot<span style={key}>C</span></button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenu(!menu)} aria-label="More" aria-expanded={menu} style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text2)', fontSize: 16 }}>⋯</button>
            {menu && (
              <>
                <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div role="menu" style={{ position: 'absolute', top: 48, right: 0, zIndex: 41, width: 290, background: 'var(--raised2)', borderRadius: 12, boxShadow: 'var(--float)', padding: 6, display: 'flex', flexDirection: 'column' }}>
                  {menuItems.map((m) => <div key={m.label}>{m.sep && <i style={{ display: 'block', height: 1, background: 'var(--hair)', margin: '6px 4px' }} />}<button role="menuitem" onClick={m.go} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '9px 10px', borderRadius: 6, fontSize: 13.5, textAlign: 'left', color: m.fg ?? 'var(--text2)', width: '100%' }}><span>{m.label}</span>{m.sub && <span style={{ fontSize: 12, color: 'var(--faint)', lineHeight: 1.4 }}>{m.sub}</span>}</button></div>)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {err && <div role="alert" className="reason">{err}</div>}
      {s.protected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 13.5, color: 'var(--text2)' }}>
          <span style={{ flexShrink: 0, color: 'var(--text)' }}><Lock size={16} /></span>
          <span style={{ flex: 1 }}><b style={{ fontWeight: 500, color: 'var(--text)' }}>Protected from deletion.</b> Photos in this shoot can’t be removed, the shoot can’t be deleted, and nothing here shows up in removal review.</span>
          <button onClick={() => protect(false)} style={{ fontSize: 13, color: 'var(--text)' }}>Turn off</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12 }}>
        {[[String(photos.length), 'Photographs'], [`${photos.length ? Math.round((reviewed / photos.length) * 100) : 0}%`, 'Reviewed'], [String(due.length), 'Due for review'], [String(loved), 'Loved']].map(([v, l]) => <div key={l} style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ font: `400 28px/1 ${serif}` }}>{v}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{l}</span></div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid var(--hair)', paddingBottom: 10 }}>
        <span style={{ font: `400 22px ${serif}` }}>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {selecting && <button onClick={() => setPicked(photos.every((p) => picked.has(p.id)) ? new Set() : new Set(photos.map((p) => p.id)))} style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{photos.every((p) => picked.has(p.id)) ? 'Clear all' : 'Select all'}</button>}
          <button onClick={() => { setSelecting(!selecting); setPicked(new Set()); }} aria-pressed={selecting} style={{ ...pill, height: 40, background: selecting ? 'var(--btn-bg)' : 'transparent', color: selecting ? 'var(--btn-fg)' : 'var(--text)', boxShadow: selecting ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{selecting ? 'Done' : 'Select'}<span style={key}>S</span></button>
        </div>
      </div>
      <JustifiedGrid photos={photos} selecting={selecting} picked={picked} due={isDue} onClick={(p) => (selecting ? flip(p.id) : nav(`/photo/${p.id}`))} />

      {selecting && <PickedBar ids={[...picked]} photos={photos} shoots={all.data ?? []} onClear={() => setPicked(new Set())} onChanged={() => { list.reload(); shoot.reload(); all.reload(); }} say={toast.say} />}
      {sharing && <SharePanel kind="shoot" id={s.id} name={title} onClose={() => setSharing(false)} />}
      {confirm && <ConfirmDialog title={`Delete “${title}”?`} sub={`All ${photos.length} photographs move to Recently removed, where you can restore them. Ratings and tags come back with them.`} cta="Delete shoot" onGo={remove} onClose={() => setConfirm(false)} />}
      {toast.node}
    </div>
  );
}

/** Used by the shoots route: `?adv=1` keeps the detailed page (place, dates, gear, tags, filters). */
export function useAdvancedShoot() { const [sp] = useSearchParams(); return !!sp.get('adv'); }
