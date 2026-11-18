import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl } from '../api';
import { Sheet } from '../components/Sheet';
import type { Collection, PhotoLite } from '../data';
import { FRAMES, MATS, PAD, frameOf, isFull, metres, rectsIn, sizeLabel, type Print } from '../layout';
import { printsSummary } from '../screens/walls';
import { primaryBtn } from './ui';

export type GuestChange = { id: string; who: string; what: string; approve: () => Promise<void>; deny: () => Promise<void> };
type Props = {
  c: Collection; prints: Print[]; byId: Map<number, PhotoLite>; order: number[]; readOnly: boolean;
  library: PhotoLite[]; changes: GuestChange[]; people: { name: string; when: string; avg: string }[];
  saveLayout: (ps: Print[]) => Promise<void>; setStage: (s: Collection['stage']) => Promise<void>; onShare: () => void; reload: () => void;
};
const STAGES: [Collection['stage'], string, string][] = [['progress', 'Progress', 'progress'], ['review', 'Review', 'review'], ['done', 'Done', 'done']];

/** A composition on a phone: stage, the wall with the print you are working on, the prints, and the candidates to place. Arranging and room photos stay on a bigger screen. */
export function MobileComposition({ c, prints, byId, order, readOnly, library, changes, people, saveLayout, setStage, onShare, reload }: Props) {
  const nav = useNavigate();
  const [sel, setSel] = useState(0);
  const [sheet, setSheet] = useState<null | 'guests' | 'add'>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const f = prints.length ? frameOf(prints, PAD) : null;
  const rects = f ? rectsIn(prints, f) : [];
  const chosen = prints.reduce((n, p) => n + (p.photoId ? 1 : 0) + (p.stack && p.photoId2 ? 1 : 0), 0);
  const slots = prints.reduce((n, p) => n + (p.stack ? 2 : 1), 0);
  const used = new Set(prints.flatMap((p) => [p.photoId, p.stack ? p.photoId2 : null]).filter((x): x is number => x != null));
  const title = (id: number | null) => (id != null ? byId.get(id)?.title || byId.get(id)?.file || 'Photo' : '');
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const place = (photoId: number) => run(() => saveLayout(prints.map((p, i) => (i === sel ? { ...p, photoId } : p))));
  const pending = changes.length;
  const none = prints.length === 0;

  return (
    <div className="ppage" data-screen-label="Composition">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, gap: 8 }}>
          <button onClick={() => nav('/collections')} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', fontSize: 13, color: 'var(--text2)' }}>← Compositions</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSheet('guests')} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Guests{pending > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', font: '600 11px/20px var(--mono)', textAlign: 'center', padding: '0 4px' }}>{pending}</span>}</button>
            <button onClick={onShare} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>Share</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: '400 40px/1 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{c.name}</h1>
          <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{printsSummary(c)}{f ? ` · ${metres(f.w)} × ${metres(f.h)} m` : ''}</span>
        </div>
        <div role="group" aria-label="Stage" style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--surface)' }}>
          {STAGES.map(([k, l, shape]) => <button key={k} aria-pressed={c.stage === k} disabled={busy} onClick={() => run(() => setStage(k))} style={{ flex: 1, height: 38, borderRadius: 999, background: c.stage === k ? 'var(--btn-bg)' : 'transparent', color: c.stage === k ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><span aria-hidden className={`stage-shape ${shape}`} />{l}</button>)}
        </div>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ position: 'relative', height: 250, borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--wall-bg)', backgroundImage: 'linear-gradient(var(--wall-grid) 1px,transparent 1px),linear-gradient(90deg,var(--wall-grid) 1px,transparent 1px)', backgroundSize: '20px 20px', display: 'grid', placeItems: 'center' }}>
          {f && (
            <div style={{ position: 'relative', height: '86%', maxWidth: '92%', aspectRatio: String(f.W / f.H) }}>
              {rects.map((r, i) => {
                const p = prints[i], fr = p.frame, on = i === sel;
                return (
                  <button key={p.id} onClick={() => setSel(i)} aria-label={`Print ${i + 1}`} aria-pressed={on} style={{ position: 'absolute', ...r, background: fr && fr.color !== 'none' ? FRAMES[fr.color] : 'transparent', padding: fr && fr.color !== 'none' ? 3 : 0, boxSizing: 'border-box', boxShadow: on ? '0 0 0 3px var(--accent)' : '0 4px 10px rgba(0,0,0,.35)' }}>
                    <span style={{ display: 'block', width: '100%', height: '100%', background: fr ? MATS[fr.mat] : 'transparent', padding: fr && fr.size !== p.size ? '8%' : 0, boxSizing: 'border-box' }}>
                      <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: 'rgba(28,27,25,.45)', background: p.photoId ? `url(${imgUrl(p.photoId, 'thumb')}) center/cover` : 'rgba(28,27,25,.06)', boxShadow: p.photoId ? 'none' : 'inset 0 0 0 1px rgba(28,27,25,.25)' }}>{p.photoId ? '' : '+'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <span style={{ position: 'absolute', left: 14, bottom: 10, font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{prints.length} PRINT{prints.length === 1 ? '' : 'S'}</span>
        </div>
        {!none && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 8 }}><span style={{ font: '400 30px/1 var(--serif)' }}>Prints</span><span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{chosen} of {slots} chosen</span></div>
            {prints.map((p, i) => (
              <button key={p.id} onClick={() => setSel(i)} aria-pressed={i === sel} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 64, padding: '0 4px', borderTop: '1px solid var(--hair)', background: i === sel ? 'var(--surface)' : 'transparent', borderRadius: 12, textAlign: 'left' }}>
                <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 4, background: p.photoId ? `url(${imgUrl(p.photoId, 'thumb')}) center/cover` : 'transparent', boxShadow: i === sel ? '0 0 0 2px var(--accent)' : p.photoId ? 'none' : 'inset 0 0 0 1px var(--outline)' }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 16 }}>Print {i + 1} · {p.size} {p.orientation}</span><span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{p.photoId ? title(p.photoId) : 'Empty'}</span></span>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ font: '400 30px/1 var(--serif)' }}>Candidates</span>{!readOnly && <button onClick={() => setSheet('add')} style={{ fontSize: 14, color: 'var(--text2)', height: 32 }}>+ Add photos</button>}</div>
          {!none && !readOnly && <span style={{ fontSize: 14, color: 'var(--muted)' }}>Tap a photo to place it in Print {sel + 1}.</span>}
          <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 4, overflowX: 'auto', margin: '0 -20px', padding: '0 20px', scrollbarWidth: 'none' }}>
            {order.map((pid) => {
              const at = prints.findIndex((p) => p.photoId === pid || (p.stack && p.photoId2 === pid));
              const ph = byId.get(pid);
              return (
                <button key={pid} disabled={readOnly || none || busy} onClick={() => place(pid)} aria-label={`Place ${title(pid)} in Print ${sel + 1}`} style={{ position: 'relative', flexShrink: 0, width: 92, height: 92, borderRadius: 6, background: `url(${imgUrl(pid, 'thumb')}) center/cover var(--surface)`, boxShadow: at === sel ? '0 0 0 2px var(--accent)' : 'none' }}>
                  {at >= 0 && <span style={{ position: 'absolute', left: 6, top: 6, height: 20, padding: '0 8px', borderRadius: 999, background: 'rgba(240,238,232,.92)', color: '#0d0d0d', fontSize: 11.5, lineHeight: '20px' }}>Print {at + 1}</span>}
                  {ph && ph.avgRating >= 4.5 && <span aria-hidden style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 15 }}>😍</span>}
                </button>
              );
            })}
            {order.length === 0 && <span style={{ fontSize: 13.5, color: 'var(--muted)', padding: '12px 0' }}>No photographs yet. Add some to choose from.</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 14.5, lineHeight: 1.5, color: 'var(--text2)' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden style={{ flexShrink: 0 }}><rect x="2.5" y="4.5" width="13" height="9" rx="1.2" /></svg>
          Arranging, resizing and room photos open in the full app on a larger screen.
        </div>
        {isFull(prints) && c.stage === 'progress' && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Every print is filled</span>}
        {isFull(prints) && c.stage === 'progress' && <button onClick={() => run(() => setStage('review'))} style={primaryBtn}>Move to Review</button>}
      </div>

      {sheet === 'guests' && (
        <Sheet title="Guests" sub={pending ? 'Changes your guests suggested. Nothing changes until you approve it.' : 'No suggestions waiting.'} onClose={() => setSheet(null)}>
          {changes.map((g) => (
            <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 0', borderTop: '1px solid var(--hair)' }}>
              <span style={{ fontSize: 14.5, lineHeight: 1.4 }}><b style={{ fontWeight: 500 }}>{g.who}</b> · {g.what}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={busy} onClick={() => run(async () => { await g.approve(); })} style={{ height: 38, padding: '0 16px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 13 }}>Approve</button>
                <button disabled={busy} onClick={() => run(async () => { await g.deny(); })} style={{ height: 38, padding: '0 12px', fontSize: 13, color: 'var(--text2)' }}>Deny</button>
              </div>
            </div>
          ))}
          {people.length > 0 && <div style={{ display: 'flex', flexDirection: 'column' }}>{people.map((p) => <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, borderTop: '1px solid var(--hair)' }}><span style={{ flex: 1, fontSize: 15 }}>{p.name}</span><span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{p.when} rated · avg {p.avg}</span></div>)}</div>}
        </Sheet>
      )}
      {sheet === 'add' && (
        <Sheet title="Add photos" sub="Tap photographs to add them as candidates." onClose={() => { setSheet(null); reload(); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
            {library.filter((p) => !c.photoIds.includes(p.id)).slice(0, 60).map((p) => <button key={p.id} disabled={busy} onClick={() => run(async () => { await api(`/collections/${c.id}/photos/${p.id}`, { method: 'PUT' }); reload(); })} aria-label={`Add ${p.title || p.file}`} style={{ aspectRatio: '1', borderRadius: 4, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)` }} />)}
          </div>
        </Sheet>
      )}
    </div>
  );
}
