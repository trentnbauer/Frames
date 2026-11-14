import { DeleteSuggestions } from '../settings/old';
import { TodoGearInput, type GearChoice } from '../components/TodoGearInput';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoFull, PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import ProtoMore from '../proto/ProtoMore';
import { AddToComposition } from '../components/AddToComposition';
import ProtoMapPicker from '../proto/ProtoMapPicker';

type Todo = { total: number; items: { key: string; count: number; ids?: number[] }[] };
type Walk = { photos: { id: number; need: { camera: boolean; lens: boolean } }[]; things: number };
type MapHit = { name: string; address: string; kind?: string; suburb?: string; city?: string; lat?: number; lon?: number };
const REASONS: [string, string, string][] = [['all', 'Everything', ''], ['camera', 'Camera', 'camera'], ['lens', 'Lens', 'lens'], ['location', 'Location', 'place'], ['subjects', 'Subjects', 'subjects'], ['tags', 'Tags', 'tags'], ['composition', 'Not in a composition', 'composition']];
const WHAT: Record<string, string> = { all: 'details', camera: 'a camera', lens: 'a lens', location: 'a location', subjects: 'subjects', tags: 'tags', composition: 'a composition' };

/** To do (design: Proto More, page "todo"): one photograph at a time, with what it still needs. */
export function TodoPage() {
  const nav = useNavigate();
  const { settings, setSettings, refreshSummary } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const todo = useApi<Todo>('/todo');
  const walk = useApi<Walk>('/todo/walk');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const shoots = useApi<Shoot[]>('/shoots');
  const gear = useApi<{ own: GearChoice[]; found: GearChoice[] }>('/gear/items');
  const colls = useApi<Collection[]>('/collections');
  const [reason, setReason] = useState('all');
  const [skipped, setSkipped] = useState<number[]>([]);
  const [done, setDone] = useState(0);
  const [cam, setCam] = useState<string[]>(['', '', '', '', '', '']);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const key = REASONS.find((r) => r[0] === reason)![2];
  const baseIds = reason === 'all' ? (walk.data?.photos ?? []).map((p) => p.id) : todo.data?.items.find((i) => i.key === key)?.ids ?? [];
  const ids = baseIds.filter((i) => !skipped.includes(i));
  const id = ids[0];
  const photo = useApi<PhotoFull>(id ? `/photos/${id}` : null);
  const p = photo.data && photo.data.id === id ? photo.data : null;
  const shoot = shoots.data?.find((s) => s.id === p?.shootId);
  const mate = (lib.data?.photos ?? []).find((x) => x.shootId === p?.shootId && x.id !== p?.id && x.camera);

  useEffect(() => {
    if (!p) return;
    setCam([p.camera, p.lens, p.aperture ? `f/${p.aperture}` : '', p.shutter, p.iso ? String(p.iso) : '', p.film]);
    setDesc(p.description || '');
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!todo.data || !walk.data) return <div className="page-shell"></div>;
  const removalCount = todo.data.items.find((item) => item.key === 'delete')?.count ?? 0;
  const counts: Record<string, number> = { all: walk.data.photos.length };
  for (const [k, , kk] of REASONS) if (kk) counts[k] = todo.data.items.find((i) => i.key === kk)?.count ?? 0;
  // Tags can be added on any to-do photo, whichever list it came from.
  const currentNeed = walk.data.photos.find((item) => item.id === id)?.need;
  const cameraNeeded = !!(currentNeed?.camera || currentNeed?.lens);
  const show = (k: string) => k === 'tags' || reason === k || (reason === 'all' && (['location', 'subjects', 'desc'].includes(k) || (k === 'camera' && cameraNeeded)));
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p!.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); };
  const chip = (kind: 'subject' | 'tag') => (p?.tags ?? []).filter((t) => t.kind === kind && !(kind === 'tag' && t.source === 'gear')).map((t) => ({ label: `${t.accepted ? '✓' : '✦'} ${t.name}`, bg: t.accepted ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', fg: t.accepted ? 'var(--text)' : 'var(--text2)', ring: t.accepted ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent)', go: () => tagAct(t.name, t.kind, t.accepted ? 'remove' : 'accept'), reject: t.accepted || t.source !== 'ai' ? null : () => tagAct(t.name, t.kind, 'reject') }));
  const advance = () => { setSkipped((s) => (id ? [...s, id] : s)); };
  const save = async () => {
    if (!p) return;
    const body: Record<string, unknown> = {};
    if (cam[0] !== p.camera) body.camera = cam[0];
    if (cam[1] !== p.lens) body.lens = cam[1];
    if (cam[3] !== p.shutter) body.shutter = cam[3];
    if (cam[5] !== p.film) body.film = cam[5];
    const ap = Number(cam[2].replace(/^f\//i, '')); if (cam[2] && ap && ap !== p.aperture) body.aperture = ap;
    const iso = Number(cam[4]); if (cam[4] && iso && iso !== p.iso) body.iso = iso;
    if (desc !== (p.description || '')) body.description = desc;
    if (Object.keys(body).length) await api(`/photos/${p.id}`, { method: 'PATCH', body });
    setDone((d) => d + 1); advance(); todo.reload(); walk.reload(); refreshSummary();
  };
  const v = {
    isTodo: true, isStats: false, isCompare: false, isDupes: false, isNew: false, isWelcome: false,
    todoCount: ids.length.toLocaleString(), todoDone: done, todoWhat: WHAT[reason],
    reasons: REASONS.map(([k, label]) => ({ label, n: (counts[k] ?? 0).toLocaleString(), bg: reason === k ? 'var(--text)' : 'var(--hover)', fg: reason === k ? 'var(--bg)' : 'var(--text2)', go: () => { setReason(k); setSkipped([]); } })),
    tShowCamera: show('camera') || reason === 'lens', tShowLocation: show('location'), tShowSubjects: show('subjects'), tShowTags: show('tags'), tShowDesc: show('desc'), tShowComp: !!p,
    tPhoto: id ? imgUrl(id, 'preview') : '', tTitle: p?.title || p?.file || '', tShoot: shoot?.name ?? '', tIdx: skipped.length + 1,
    tCam: [['Body', 'Camera body'], ['Lens', 'Lens'], ['Aperture', 'f/–'], ['Shutter', '1/–'], ['ISO', 'ISO'], ['Film', 'Film stock']].map(([label, ph], i) => ({ label, ph, control: [0, 1, 5].includes(i) ? <TodoGearInput key={`${id}-${i}`} value={cam[i]} type={i === 0 ? 'camera' : i === 1 ? 'lens' : 'film'} placeholder={ph} owned={gear.data?.own ?? []} discovered={gear.data?.found ?? []} onChange={(value) => setCam((current) => current.map((item, index) => index === i ? value : item))} /> : null, value: cam[i], ring: cam[i] ? 'var(--outline)' : 'color-mix(in srgb, var(--text) 12%, transparent)', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCam((c) => c.map((x, j) => (j === i ? e.target.value : x))) })),
    tCamMissing: `${cam.filter((x) => !x).length} of 6 missing`, tRollHint: mate ? [mate.camera, mate.lens].filter(Boolean).join(' · ') : '',
    useRoll: () => mate && setCam([mate.camera, mate.lens, mate.aperture ? `f/${mate.aperture}` : '', mate.shutter, mate.iso ? String(mate.iso) : '', mate.film]),
    tTags: chip('tag'), tSubjects: chip('subject'), tShootTags: [...(shoot?.subjects ?? []), ...(shoot?.tags ?? [])].join(', ') || 'none',
    tComps: [], tCompPicker: p ? <AddToComposition key={p.id} ids={[p.id]} label="Add to composition" onDone={() => { colls.reload(); todo.reload(); walk.reload(); refreshSummary(); }} /> : null,
    tAiLabel: busy ? 'Analyzing…' : '✦ Analyze with AI', tAiFg: busy ? 'var(--text2)' : 'var(--text)', tAiSpin: null,
    tAnalyze: async () => { if (busy || !p || !ai) return; setBusy(true); try { await api(`/photos/${p.id}/recheck`, { body: {} }); photo.reload(); } finally { setBusy(false); } },
    openMap: () => setMapOpen(true), mapLabel: p && p.lat !== null && p.lon !== null ? p.place.trim() || `On the map · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` : 'Pick on the map',
    tDesc: desc, onDesc: (e: React.ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value), tDescHint: 'Describe the photograph in a sentence', useDesc: () => { const s = p?.aiSuggestion?.description; if (s) setDesc(s); },
    addSubject: (name: string) => tagAct(name, 'subject', 'accept'), addTag: (name: string) => tagAct(name, 'tag', 'accept'),
    skipTodo: advance, saveTodo: () => save(),
  };
  return (
    <div className="page-shell">
      {removalCount > 0 && settings && <section style={{ background: 'var(--surface)', padding: 24, borderRadius: 12, marginBottom: 24 }}>
        {!id && <h1 className="serif" style={{ fontSize: 48, marginTop: 0 }}>To do</h1>}
        <DeleteSuggestions s={settings} save={async (patch) => { await setSettings(patch); }} inline onChanged={() => { todo.reload(); walk.reload(); lib.reload(); refreshSummary(); }} />
      </section>}


      {mapOpen && p && (
        <ProtoMapPicker
          place={p.place || p.lat !== null ? { name: p.place, address: p.placeAddress, kind: p.placeKind, lat: p.lat, lng: p.lon, precision: p.placePrecision, suburb: '', city: '' } : null}
          searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)}
          reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (pl: { name: string; address: string; kind: string; lat: number; lng: number; precision: string }) => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: pl.name, placeAddress: pl.address, placeKind: pl.kind, placePrecision: pl.precision, lat: pl.lat, lon: pl.lng } }); photo.reload(); todo.reload(); walk.reload(); refreshSummary(); }}
          onRemovePlace={async () => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: '', placeAddress: '', placeKind: '', lat: null, lon: null } }); photo.reload(); todo.reload(); walk.reload(); refreshSummary(); }}
          onClose={() => setMapOpen(false)} />
      )}
      {id ? <ProtoMore page="todo" v={v} /> : removalCount > 0 ? null : (
        <div style={{ padding: '64px 0' }}><h1 style={{ font: "400 48px/1 'Instrument Serif',Georgia,serif", margin: 0 }}>All caught up</h1><p className="muted">Nothing is waiting for {WHAT[reason]}. <button style={{ textDecoration: 'underline' }} onClick={() => nav('/')}>Back to Home</button></p></div>
      )}
    </div>
  );
}
