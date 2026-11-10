import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoFull, PhotoLite, Shoot } from '../data';
import type { Hemisphere } from '../season';
import { seasonOf } from '../season';
import { Header } from '../components/Shell';
import { useStore } from '../store';
import { CompPicker } from './CompPicker';
import ProtoPhoto from '../proto/ProtoPhoto';

type MapHit = { name: string; address: string; kind: string; suburb: string; city: string; lat: number; lon: number };
const SENSITIVE = ['Nudity', 'Violence', 'Adult'];
const SEASON_DOT: Record<string, string> = { winter: '#7aa7d8', spring: '#8fc47a', summer: '#e8b44a', autumn: '#d27a3d' };
const PAPER_MM: Record<string, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594] };
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** One photograph (design: Proto Photo): rate, name, date and season, place, tags, print size, compositions. */
export function Photo() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const [qs] = useSearchParams();
  const todoKey = qs.get('todo');
  const photo = useApi<PhotoFull>(`/photos/${id}`);
  const shoots = useApi<Shoot[]>('/shoots');
  const all = useApi<{ photos: PhotoLite[] }>('/photos');
  const inPf = useApi<{ state: 'in' | 'auto' | 'none'; inPortfolio: boolean; favourite: boolean; score: number | null }>(`/portfolio/photos/${id}`);
  const profile = useApi<{ hemisphere: Hemisphere }>('/profile');
  const colls = useApi<Collection[]>('/collections');
  const guests = useApi<{ avg: number | null; n: number }>(`/photos/${id}/guests`);
  const todo = useApi<{ items: { key: string; ids?: number[] }[] }>(todoKey ? '/todo' : null);
  const snapshot = useRef<number[] | null>(null);
  const live = todo.data?.items.find((i) => i.key === todoKey)?.ids ?? null;
  if (todoKey && live && !snapshot.current) snapshot.current = live;
  const [title, setTitle] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const p = photo.data;
  useEffect(() => { setTitle(p?.title ?? ''); }, [p?.id, p?.title]);
  useEffect(() => { document.title = `${p?.title || 'Photograph'} · Frames`; }, [p?.title]);

  if (!p) return <div className="page-shell"><Header />{photo.error && <p role="alert" className="muted">Something went wrong: {photo.error}</p>}</div>;
  const here = Number(id);
  const libList = all.data?.photos ?? [];
  const walk = todoKey ? (snapshot.current ?? []).filter((x) => x === here || !live || live.includes(x)) : null;
  const stepIds = walk ?? libList.map((x) => x.id);
  const idx = stepIds.indexOf(here);
  const step = (d: number) => { if (!stepIds.length) return; nav(`/photo/${stepIds[(idx + d + stepIds.length) % stepIds.length]}${todoKey ? `?todo=${todoKey}` : ''}`); };
  const shoot = shoots.data?.find((s) => s.id === p.shootId);
  const mates = libList.filter((x) => x.shootId === p.shootId);
  const back = () => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav(todoKey ? '/todo' : shoot ? `/shoots/${shoot.id}` : '/library'); };
  const patch = async (body: Record<string, unknown>) => { await api(`/photos/${p.id}`, { method: 'PATCH', body }); photo.reload(); };
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); refreshSummary(); };
  const ai = !!settings && settings.ai !== 'off';

  const rs = p.reviews;
  const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
  const g = guests.data;
  const combined = (you: number | null) => (you !== null && g?.avg != null ? you * 0.65 + g.avg * 0.35 : you ?? g?.avg ?? null);
  const score = combined(avg);
  const rank = avg === null ? null : 1 + mates.filter((x) => x.reviewCount > 0 && x.avgRating > avg).length;

  const camera = p.capturedAt?.slice(0, 10) ?? '';
  const dateVal = p.dateEdit ?? (camera || p.addedAt.slice(0, 10));
  const hemi = profile.data?.hemisphere ?? 'north';
  const month = Number(dateVal.slice(5, 7));
  const season = hemi === 'none' || !month ? '' : seasonOf(month, hemi);

  const portrait = p.h > p.w;
  const fits = (['A4', 'A3', 'A2'] as const).map((size) => {
    const [a, b] = PAPER_MM[size];
    const ppi = Math.floor(Math.min(p.w / ((portrait ? a : b) / 25.4), p.h / ((portrait ? b : a) / 25.4)));
    return { size, ppi, ok: ppi >= 300 };
  });
  const okSizes = fits.filter((f) => f.ok);
  const best = okSizes[okSizes.length - 1];
  const next = fits.find((f) => !f.ok);

  const place = p.place || p.lat !== null ? { name: p.place, address: p.placeAddress, kind: p.placeKind, lat: p.lat, lng: p.lon, precision: p.placePrecision as string, suburb: '', city: '' } : null;
  const inComps = (colls.data ?? []).filter((c) => c.photoIds.includes(p.id));
  const stateOf = (c: Collection) => { if (c.printedAt) return 'Printed'; const slot = c.chosenIds.indexOf(p.id); return slot >= 0 ? `Print ${slot + 1} · ${c.layout.prints[slot]?.size ?? ''}` : 'Candidate'; };
  const accepted = p.tags.filter((t) => t.accepted);
  const sensOn = (n: string) => accepted.some((t) => t.name.toLowerCase() === n.toLowerCase());
  const suggested = ai ? p.tags.filter((t) => !t.accepted && t.source === 'ai') : [];
  const mb = Math.round(p.sizeMb || 0);

  return (
    <div className="page-shell">
      <Header />
      <ProtoPhoto
        photoSrc={imgUrl(p.id, 'preview')} idx={idx >= 0 ? idx + 1 : 1} total={stepIds.length || 1} shootName={shoot?.name ?? 'Library'} onBack={back}
        onStep={step} onFindSimilar={() => nav(`/library?similarTo=${p.id}`)}
        mates={mates.map((m) => ({ id: m.id, src: imgUrl(m.id, 'thumb'), ar: m.ar, current: m.id === p.id }))} onOpenMate={(mid: number) => nav(`/photo/${mid}`)}
        pfOn={inPf.data?.state === 'in' || inPf.data?.state === 'auto'} pfLabel={inPf.data?.state === 'in' ? 'In portfolio' : inPf.data?.state === 'auto' ? `Auto · score ${inPf.data.score?.toFixed(1)}` : 'Add to portfolio'}
        pfTitle={inPf.data?.state === 'auto' ? 'Added by your score rule. Click to keep it out.' : 'Show this photograph in your public portfolio'}
        onTogglePf={async () => { await api(`/portfolio/photos/${p.id}`, { body: { on: inPf.data?.state === 'none' } }); inPf.reload(); }}
        fav={!!inPf.data?.favourite} onToggleFav={async () => { await api(`/portfolio/photos/${p.id}`, { body: { favourite: !inPf.data?.favourite } }); inPf.reload(); }}
        aiBusy={aiBusy || p.aiStatus === 'pending'} aiDone={p.aiStatus === 'done'}
        onRunAi={async () => { if (!ai) return 'AI is off. Turn it on in Settings.'; setAiBusy(true); try { await patch({ reanalyse: true }); return 'Analysing with AI…'; } catch (e) { return (e as Error).message; } finally { setAiBusy(false); } }}
        moreItems={[
          { label: inPf.data?.state === 'none' ? 'Add to portfolio' : 'In portfolio ✓', run: async () => { await api(`/portfolio/photos/${p.id}`, { body: { on: inPf.data?.state === 'none' } }); inPf.reload(); }, toast: 'Portfolio updated' },
          { label: inPf.data?.favourite ? '★ Favourite' : '☆ Favourite', meta: 'F', run: async () => { await api(`/portfolio/photos/${p.id}`, { body: { favourite: !inPf.data?.favourite } }); inPf.reload(); } },
          { label: 'Download original', meta: `${mb} MB`, sep: true, run: () => { window.location.assign(`/api/photos/${p.id}/original`); }, toast: `Downloading ${p.file}` },
          { label: 'Export XMP', run: () => { window.location.assign(`/api/photos/${p.id}/xmp`); }, toast: 'XMP sidecar written' },
          { label: 'Review again', sep: true, run: async () => { await patch({ reviewAgain: true }); refreshSummary(); }, toast: 'Added back to the review queue' },
          { label: p.archived ? 'Include in review' : 'Leave out of review', run: async () => { await patch({ archived: !p.archived }); }, toast: p.archived ? 'Back in review' : 'Won’t come back for review' },
          { label: 'Delete photo…', sep: true, danger: true },
        ]}
        inComps={inComps.map((c) => ({ name: c.name, state: stateOf(c), open: () => nav(`/collections/${c.id}`) }))}
        renderCompPicker={(close: () => void, done: (m: string) => void) => <CompPicker ids={[p.id]} from={p.title || p.file} onClose={close} onDone={(m) => { colls.reload(); done(m); }} />}
        title={title} onTitle={(v: string) => { setTitle(v); clearTimeout((window as unknown as { __tt?: number }).__tt); (window as unknown as { __tt?: number }).__tt = window.setTimeout(() => { void patch({ title: v }); }, 700); }}
        dateVal={dateVal} dateTitle="Click to edit the date" dateEdited={!!p.dateEdit} onDate={(v: string) => patch({ dateEdit: v || null })} onResetDate={() => patch({ dateEdit: null })}
        dateSrc={p.dateEdit ? 'Date edited by you' : camera ? 'Date taken, from camera data' : 'No camera date · using the upload date'}
        season={season ? cap(season) : 'No season'} seasonDot={season ? SEASON_DOT[season] : 'transparent'} seasonTitle={hemi === 'none' ? 'Seasons are turned off in Settings' : `${cap(hemi)}ern hemisphere`}
        palette={(p.palette ?? []).map((c) => ({ title: `${c.name} · ${Math.round(c.pct)}%`, pct: Math.max(1, Math.round(c.pct)), hex: c.hex }))} paletteNames={[...new Set((p.palette ?? []).map((c) => c.name))].slice(0, 5).join(', ')}
        score={score !== null ? score.toFixed(1) : '–'} you={avg !== null ? avg.toFixed(1) : '–'} guests={g?.avg != null ? `${g.avg.toFixed(1)} (${g.n})` : '–'}
        rankLine={rank !== null ? `#${rank} of ${mates.length} in its shoot` : `${mates.length} in its shoot`} nextDue={p.nextReviewAt ? `Next review due ${new Date(p.nextReviewAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not due for review'}
        rateSub={`Session ${Math.min(rs.length + 1, 9)}`}
        rateResult={(n: number) => { const you = (rs.reduce((a, r) => a + r.rating, 0) + n) / (rs.length + 1); return `Your score ${avg !== null ? avg.toFixed(1) : '–'} → ${you.toFixed(1)} · combined ${(combined(you) ?? you).toFixed(1)}.`; }}
        onRate={async (n: number, note: string) => { await api('/review/rate', { body: { photoId: p.id, rating: n, note } }); photo.reload(); refreshSummary(); }}
        printLine={best ? <>Sharp up to <b style={{ fontWeight: 500 }}>{best.size}</b>{next && <span style={{ color: 'var(--muted)' }}> · {next.size} at {next.ppi} PPI</span>}</> : <>Below 300 PPI even at A4 <span style={{ color: 'var(--muted)' }}>· {fits[0].ppi} PPI</span></>}
        printSub={next ? `${next.size} looks sharp from ${((3 * 3438) / Math.max(next.ppi, 1) * 0.0254).toFixed(1)} m away or more` : 'Every common size is sharp at arm’s length'}
        place={place} defaultLat={undefined} defaultLng={undefined}
        searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)}
        reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
        onSavePlace={async (pl: { name: string; address: string; kind: string; lat: number; lng: number; precision: string }) => { await patch({ place: pl.name, placeAddress: pl.address, placeKind: pl.kind, placePrecision: pl.precision, lat: pl.lat, lon: pl.lng }); }}
        onRemovePlace={async () => { await patch({ place: '', placeAddress: '', placeKind: '', lat: null, lon: null }); }}
        sensitive={SENSITIVE.map((n) => ({ name: n, on: sensOn(n) }))}
        onSensitive={async (name: string, on: boolean) => { await tagAct(name.toLowerCase(), 'tag', on ? 'accept' : 'remove'); }}
        tags={accepted.filter((t) => !SENSITIVE.some((n) => n.toLowerCase() === t.name.toLowerCase())).map((t) => ({ label: t.name, accepted: t.source === 'ai', remove: () => tagAct(t.name, t.kind, 'remove') }))}
        aiTags={suggested.map((t) => ({ label: t.name, mark: '+', fg: 'var(--text2)', bg: 'transparent', ring: 'inset 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent)', accept: () => tagAct(t.name, t.kind, 'accept') }))}
        onAddTag={async (name: string) => { await tagAct(name, 'tag', 'accept'); }}
        description={p.description || (ai && p.aiSuggestion?.description) || ''}
        detailFields={[['camera', 'Camera', 'Camera', p.camera], ['lens', 'Lens', 'Lens', p.lens], ['aperture', 'Aperture', 'f/–', p.aperture ? `f/${p.aperture}` : '']].map(([k, t, ph, val]) => ({ kind: k === 'camera' || k === 'lens' ? k : '', onCommit: (v: string) => { if (v !== String(val)) void patch({ [k]: v }); }, value: val, title: `${t} · click to edit`, ph, size: Math.max(3, String(val || ph).length), onChange: () => undefined, onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = e.target.value.trim(); if (v !== String(val)) void patch(k === 'aperture' ? { aperture: Number(v.replace(/^f\//i, '')) || null } : { [k]: v }); } }))}
        trashHint={`${p.file} and its XMP sidecar${mb ? ` · ${mb} MB` : ''}`}
        delSub={`${p.title || p.file} · ${shoot?.name ?? ''}`} delWarn={`${inComps.length ? `It’s in ${inComps.length} composition${inComps.length === 1 ? '' : 's'}` : 'It’s not in a composition'}${inPf.data?.state !== 'none' ? ' and your portfolio' : ''}. It will be removed from all of them, along with its ratings and tags.`}
        onDelete={async (mode: 'frames' | 'trash') => { await api('/photos/remove', { body: { ids: [p.id], originals: mode === 'trash' ? 'trash' : 'keep' } }); refreshSummary(); step(1); }}
      />
    </div>
  );
}
