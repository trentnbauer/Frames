import { useEffect, useState } from 'react';
import { RotateButton } from '../components/RotateButton';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { CompPicker } from '../components/AddToComposition';
import { SharePanel } from '../components/SharePanel';
import { MoveToShoot } from '../components/MoveToShoot';
import { Sheet } from '../components/Sheet';
import { RATINGS, fmtDate, type PhotoFull, type PhotoLite, type Shoot } from '../data';
import { useStore } from '../store';
import { Eyebrow, primaryBtn } from './ui';

type Tab = 'details' | 'tags' | 'history';
const circle = { position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: 'rgba(30,30,29,.82)', color: '#efede8', display: 'grid', placeItems: 'center' } as const;

/** One photograph on a phone: the picture, your rating, add to a composition, and Details / Tags / History. */
export function MobilePhoto() {
  const { id } = useParams();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const { settings, refreshSummary } = useStore();
  const photo = useApi<PhotoFull>(`/photos/${id}`);
  const shoots = useApi<Shoot[]>('/shoots');
  const all = useApi<{ photos: PhotoLite[] }>('/photos');
  const [tab, setTab] = useState<Tab>('details');
  const [edit, setEdit] = useState<null | 'title' | 'description' | 'place'>(null);
  const [draft, setDraft] = useState('');
  const [newTag, setNewTag] = useState('');
  const [sheet, setSheet] = useState<null | 'more' | 'move' | 'comp' | 'remove'>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');
  const p = photo.data;
  useEffect(() => { setEdit(null); setErr(''); }, [id]);
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2400); };
  if (!p) return <div className="ppage" style={{ paddingTop: 80 }}>{photo.error ? <p role="alert" className="muted">Something went wrong: {photo.error}</p> : <p className="muted">Loading…</p>}</div>;

  const here = Number(id);
  const libList = all.data?.photos ?? [];
  const fromLibrary = qs.get('in') === 'library';
  const stepIds = (fromLibrary ? libList : libList.filter((x) => x.shootId === p.shootId)).map((x) => x.id);
  const idx = stepIds.indexOf(here);
  const go = (to: number) => nav(`/photo/${stepIds[to]}${fromLibrary ? '?in=library' : ''}`, { replace: true });
  const shoot = shoots.data?.find((s) => s.id === p.shootId);
  const ai = !!settings && settings.ai !== 'off';
  const patch = async (body: Record<string, unknown>) => { setErr(''); try { await api(`/photos/${p.id}`, { method: 'PATCH', body }); photo.reload(); } catch (e) { setErr((e as Error).message); } };
  const tagAct = async (name: string, kind: string, action: string) => { setErr(''); try { await api(`/photos/${p.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); refreshSummary(); } catch (e) { setErr((e as Error).message); } };
  const accepted = p.tags.filter((t) => t.accepted);
  const suggested = p.tags.filter((t) => !t.accepted);
  const descSuggested = ai && !p.description && !!p.aiSuggestion?.description;
  const save = () => { if (!edit) return; const v = draft.trim(); void patch(edit === 'place' ? { place: v } : { [edit]: v }); setEdit(null); };
  const row = (key: 'title' | 'description' | 'place' | null, label: string, value: string, placeholder: string, aiDesc = false, action?: { label: string; run: () => void }) => {
    const editing = !!key && edit === key;
    const open = () => { if (key && !editing) { setEdit(key); setDraft(value); } };
    return (
      <div key={label} style={{ borderBottom: '1px solid var(--hair)' }}>
        <div role={key ? 'button' : undefined} tabIndex={key ? 0 : undefined} onClick={open} onKeyDown={(e) => { if (key && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 52, cursor: key ? 'pointer' : undefined }}>
          <span style={{ width: 92, flexShrink: 0, fontSize: 12.5, color: 'var(--muted)' }}>{label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.35, color: value ? 'var(--text)' : 'var(--faint)', textWrap: 'pretty' as never, overflowWrap: 'anywhere', ...(editing ? {} : key === 'description' ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}) }}>{aiDesc && value && <span aria-label="Added by AI" title="Added by AI">✦ </span>}{editing ? '' : value || placeholder}</span>
          {action && <button onClick={action.run} style={{ fontSize: 13, color: 'var(--text2)', height: 44, paddingLeft: 12 }}>{action.label}</button>}
          {key && !editing && <span aria-hidden style={{ color: 'var(--faint)' }}>›</span>}
          {editing && <button onClick={save} style={{ fontSize: 13, color: 'var(--text2)', height: 44, paddingLeft: 12 }}>Save</button>}
        </div>
        {editing && <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label={label} style={{ width: '100%', boxSizing: 'border-box', resize: 'none', border: 0, outline: 'none', borderRadius: 10, padding: '10px 12px', margin: '0 0 12px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 15, lineHeight: 1.45, fontFamily: 'inherit' }} />}
      </div>
    );
  };
  const avg = p.reviews.length ? p.reviews.reduce((n, r) => n + r.rating, 0) / p.reviews.length : null;
  const due = !!p.nextReviewAt && p.nextReviewAt <= new Date().toISOString();
  const moveTo = async (s: Shoot) => { try { await api(`/shoots/${s.id}/move`, { body: { photoIds: [p.id] } }); setSheet(null); photo.reload(); say(`Moved to “${s.name}”`); } catch (e) { setErr((e as Error).message); } };
  const remove = async () => {
    try { await api('/photos/remove', { body: { ids: [p.id], originals: 'keep' } }); refreshSummary(); nav(shoot ? `/shoots/${shoot.id}` : '/library', { replace: true }); } catch (e) { setSheet(null); setErr((e as Error).message); }
  };
  const protectedShoot = !!shoot?.protected;

  return (
    <div className="ppage flush" data-screen-label="Photo" style={{ padding: 0 }}>
      <div style={{ position: 'relative', height: 420, background: 'var(--review)', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 44, boxSizing: 'border-box' }}>
        <div role="img" aria-label={p.title || p.file} style={{ width: '100%', height: '100%', background: `url(${imgUrl(p.id, 'preview')}) center/contain no-repeat` }} />
        <RotateButton id={p.id} onDone={() => photo.reload()} style={{ position: 'absolute', left: '50%', marginLeft: -20, bottom: 14, width: 40, height: 40, background: 'rgba(30,30,29,.82)', color: '#efede8', boxShadow: 'none' }} />
        <button onClick={() => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav(shoot ? `/shoots/${shoot.id}` : '/library'); }} aria-label="Back" style={{ ...circle, top: 52, left: 14, fontSize: 18 }}>‹</button>
        {stepIds.length > 1 && <span style={{ position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)', font: 'italic 400 18px/1 var(--serif)', color: '#efede8' }}>{idx + 1} / {stepIds.length}</span>}
        <button onClick={() => setSheet('more')} aria-label="More actions" style={{ ...circle, top: 52, right: 14 }}>⋯</button>
        {idx > 0 && <button onClick={() => go(idx - 1)} aria-label="Previous photo" style={{ ...circle, left: 14, bottom: 14 }}>←</button>}
        {idx >= 0 && idx < stepIds.length - 1 && <button onClick={() => go(idx + 1)} aria-label="Next photo" style={{ ...circle, right: 14, bottom: 14 }}>→</button>}
      </div>
      <div style={{ padding: '20px 20px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: '400 34px/1.05 var(--serif)', margin: 0, overflowWrap: 'anywhere' }}>{p.title || <span style={{ color: 'var(--faint)' }}>Add a title</span>}</h1>
          <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{p.file} · {fmtDate(p.dateEdit ?? p.capturedAt ?? p.addedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSheet('comp')} style={{ flex: 1, height: 46, borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14, textAlign: 'center' }}>Add to composition</button>
          <button onClick={() => setSharing(true)} style={{ height: 46, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Share</button>
        </div>
        <div role="tablist" style={{ display: 'flex', gap: 18, borderBottom: '1px solid var(--hair)' }}>
          {([['details', 'Details'], ['tags', `Tags${suggested.length || descSuggested ? ` · ✦ ${suggested.length + (descSuggested ? 1 : 0)}` : ''}`], ['history', 'History']] as [Tab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setEdit(null); }} style={{ height: 44, fontSize: 14, color: tab === k ? 'var(--text)' : 'var(--muted)', boxShadow: tab === k ? 'inset 0 -2px 0 var(--text)' : 'none' }}>{l}</button>)}
        </div>

        {tab === 'details' && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: -20 }}>
            {row('title', 'Title', p.title, 'Add a title')}
            {row('description', 'Description', p.description || '', 'Add a description', p.descSource === 'ai')}
            {row('place', 'Place', p.place, 'Add a place')}
            {row(null, 'Shoot', p.orphaned ? 'No shoot' : shoot?.name ?? '', '—', false, { label: 'Move', run: () => setSheet('move') })}
            {row(null, 'Date taken', fmtDate(p.dateEdit ?? p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }), '—')}
            {row(null, 'Camera', p.camera, '—')}
            {row(null, 'Lens', p.film ? `${p.lens} · ${p.film}` : p.lens, '—')}
            {row(null, 'Exposure', p.exposure, '—')}
          </div>
        )}

        {tab === 'tags' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Eyebrow>TAGS</Eyebrow>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {accepted.map((t) => <span key={`${t.kind}:${t.name}`} style={{ height: 34, display: 'inline-flex', alignItems: 'center', padding: '0 2px 0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13.5 }}>{t.source === 'ai' && <span aria-label="Added by AI" style={{ marginRight: 4 }}>✦</span>}{t.name}<button onClick={() => tagAct(t.name, t.kind, 'remove')} aria-label={`Remove tag ${t.name}`} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>×</button></span>)}
                {accepted.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>No tags yet.</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', height: 44, padding: '0 6px 0 16px', borderRadius: 999, background: 'var(--surface)' }}>
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newTag.trim()) { void tagAct(newTag.trim(), 'tag', 'accept'); setNewTag(''); } }} placeholder="Add a tag" aria-label="Add a tag" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'none', color: 'var(--text)', fontSize: 15 }} />
                <button onClick={() => { if (newTag.trim()) { void tagAct(newTag.trim(), 'tag', 'accept'); setNewTag(''); } }} style={{ height: 34, padding: '0 14px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13, fontWeight: 500 }}>Add</button>
              </div>
            </div>
            {(suggested.length > 0 || descSuggested) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Eyebrow>✦ SUGGESTED BY AI</Eyebrow><button onClick={async () => { for (const t of suggested) await tagAct(t.name, t.kind, 'accept'); if (descSuggested) await patch({ acceptAiDescription: true }); say('Accepted all AI suggestions'); }} style={{ height: 32, fontSize: 13, color: 'var(--text2)' }}>Accept all</button></div>
                {descSuggested && (
                  <div style={{ padding: 14, borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ font: '500 10.5px var(--mono)', letterSpacing: '.08em', color: 'var(--faint)' }}>DESCRIPTION</span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.45 }}><span aria-label="Suggested by AI">✦ </span>{p.aiSuggestion!.description}</span>
                    <div style={{ display: 'flex', gap: 6 }}><button onClick={() => patch({ acceptAiDescription: true })} style={{ height: 38, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>Accept</button><button onClick={() => patch({ rejectAiDescription: true })} style={{ height: 38, padding: '0 10px', fontSize: 13, color: 'var(--text2)' }}>Reject</button></div>
                  </div>
                )}
                {suggested.map((t) => (
                  <div key={`${t.kind}:${t.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, borderTop: '1px solid var(--hair)' }}>
                    <span style={{ flex: 1, fontSize: 15 }}><span aria-label="Suggested by AI">✦ </span>{t.name}</span>
                    <button onClick={() => tagAct(t.name, t.kind, 'accept')} aria-label={`Accept tag ${t.name}`} style={{ height: 36, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>Accept</button>
                    <button onClick={() => tagAct(t.name, t.kind, 'reject')} aria-label={`Reject tag ${t.name}`} style={{ width: 36, height: 36, borderRadius: '50%', color: 'var(--muted)', fontSize: 16 }}>×</button>
                  </div>
                ))}
              </div>
            ) : <span style={{ fontSize: 13, color: 'var(--muted)' }}>No AI suggestions waiting for this photograph.</span>}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, fontSize: 13, color: 'var(--muted)' }}><span>{avg !== null ? `Average ${RATINGS[Math.min(4, Math.max(0, Math.round(avg) - 1))].label} · ${p.reviews.length} review${p.reviews.length > 1 ? 's' : ''}` : 'No reviews'}</span><span>{due ? 'Due now' : p.nextReviewAt ? `Next review ${fmtDate(p.nextReviewAt)}` : ''}</span></div>
            {[...p.reviews].reverse().map((r) => <div key={`${r.session}-${r.date}`} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 50, borderTop: '1px solid var(--hair)' }}><span style={{ fontSize: 22, width: 40 }}>{RATINGS[r.rating - 1].emoji}</span><span style={{ flex: 1, fontSize: 14.5 }}>{RATINGS[r.rating - 1].label}</span><span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{fmtDate(r.date)}</span></div>)}
            {p.reviews.length === 0 && <span style={{ fontSize: 13.5, color: 'var(--muted)', padding: '12px 0' }}>Not reviewed yet. Rate it above or in the next review.</span>}
          </div>
        )}
      </div>

      {toast && <div role="status" style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95, padding: '9px 16px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13 }}>{toast}</div>}

      {sheet === 'more' && (
        <Sheet title={p.title || p.file} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Make this the shoot’s cover', act: async () => { setSheet(null); try { await api(`/shoots/${p.shootId}`, { method: 'PATCH', body: { coverId: p.id } }); say('This is now the shoot’s cover'); } catch (e) { setErr((e as Error).message); } } },
              { label: p.orphaned ? 'Put in a shoot' : 'Move to shoot', act: () => setSheet('move') },
              ...(p.orphaned ? [] : [{ label: 'Take out of its shoot (no shoot)', act: async () => { setSheet(null); try { await api('/photos/orphan', { body: { photoIds: [p.id] } }); photo.reload(); say('Now in no shoot'); } catch (e) { setErr((e as Error).message); } } }]),
              { label: 'Compare with similar', act: () => nav('/compare') },
              { label: 'Download original', meta: p.file, act: () => { setSheet(null); window.location.assign(`/api/photos/${p.id}/original`); } },
              { label: 'Remove from Frames…', fg: protectedShoot ? 'var(--faint)' : 'var(--danger)', meta: protectedShoot ? 'Shoot protected' : '', act: () => { if (protectedShoot) say('This shoot is protected from deletion'); else setSheet('remove'); } },
            ].map((r) => <button key={r.label} onClick={r.act} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderTop: '1px solid var(--hair)', textAlign: 'left', color: r.fg }}><span style={{ flex: 1, fontSize: 15 }}>{r.label}</span>{r.meta && <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)' }}>{r.meta}</span>}</button>)}
          </div>
        </Sheet>
      )}
      {sharing && <SharePanel kind="photo" id={p.id} name={p.title || p.file} onClose={() => setSharing(false)} />}
      {sheet === 'move' && (
        <Sheet title="Move to a shoot" onClose={() => setSheet(null)}>
          <MoveToShoot phone count={1} shoots={(shoots.data ?? []).filter((s) => s.id !== p.shootId)} canOrphan={!p.orphaned} busy={false} error={err} onAdd={(s) => void moveTo(s)} onClose={() => setSheet(null)}
            onCreate={async (name) => { try { await api('/shoots', { body: { name, photoIds: [p.id] } }); setSheet(null); photo.reload(); say(`Moved to “${name}”`); } catch (e) { setErr((e as Error).message); } }}
            onOrphan={async () => { try { await api('/photos/orphan', { body: { photoIds: [p.id] } }); setSheet(null); photo.reload(); say('Now in no shoot'); } catch (e) { setErr((e as Error).message); } }} />
        </Sheet>
      )}
      {sheet === 'comp' && <CompPicker ids={[p.id]} onClose={() => setSheet(null)} onDone={(m) => { setSheet(null); say(m); }} />}
      {sheet === 'remove' && (
        <Sheet title="Remove this photo from Frames?" sub="Its reviews, tags and composition places go with it. The original isn’t touched and won’t be imported again." onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setSheet(null)} style={{ height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
            <button onClick={remove} style={{ ...primaryBtn, height: 46, padding: '0 22px', background: 'var(--danger)', color: '#0d0d0d', fontSize: 14.5 }}>Remove</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
