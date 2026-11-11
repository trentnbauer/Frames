import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoFull, PhotoLite, Shoot } from '../data';
import { Header } from '../components/Shell';
import { useStore } from '../store';
import ProtoMore from '../proto/ProtoMore';
import ProtoMapPicker from '../proto/ProtoMapPicker';

type Todo = { total: number; items: { key: string; count: number; ids?: number[] }[] };
type Walk = { photos: { id: number }[]; things: number };
type MapHit = { name: string; address: string; kind?: string; suburb?: string; city?: string; lat?: number; lon?: number };
const REASONS: [string, string, string][] = [['all', 'Everything', ''], ['camera', 'Camera specs', 'camera'], ['location', 'Location', 'place'], ['subjects', 'Subjects', 'subjects'], ['tags', 'Tags', 'tags'], ['composition', 'Not in a composition', 'composition']];
const WHAT: Record<string, string> = { all: 'details', camera: 'camera specs', location: 'a location', subjects: 'subjects', tags: 'tags', composition: 'a composition' };

/** To do (design: Proto More, page "todo"): one photograph at a time, with what it still needs. */
export function TodoPage() {
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const todo = useApi<Todo>('/todo');
  const walk = useApi<Walk>('/todo/walk');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const shoots = useApi<Shoot[]>('/shoots');
  const colls = useApi<Collection[]>('/collections');
  const [reason, setReason] = useState('all');
  const [skipped, setSkipped] = useState<number[]>([]);
  const [done, setDone] = useState(0);
  const [cam, setCam] = useState<string[]>(['', '', '', '', '', '']);
  const [place, setPlace] = useState('');
  const [desc, setDesc] = useState('');
  const [hits, setHits] = useState<MapHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const timer = useRef<number>(0);

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
    setPlace(p.place); setDesc(p.description || ''); setHits([]);
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!todo.data || !walk.data) return <div className="page-shell"><Header /></div>;
  const counts: Record<string, number> = { all: walk.data.photos.length };
  for (const [k, , kk] of REASONS) if (kk) counts[k] = todo.data.items.find((i) => i.key === kk)?.count ?? 0;
  const show = (k: string) => reason === k || (reason === 'all' && ['location', 'subjects', 'desc'].includes(k));
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p!.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); };
  const chip = (kind: 'subject' | 'tag') => (p?.tags ?? []).filter((t) => t.kind === kind && !(kind === 'tag' && t.source === 'gear')).map((t) => ({ label: `${t.accepted ? '✓' : '✦'} ${t.name}`, bg: t.accepted ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', fg: t.accepted ? 'var(--text)' : 'var(--text2)', ring: t.accepted ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 22%, transparent)', go: () => tagAct(t.name, t.kind, t.accepted ? 'remove' : 'accept') }));
  const inComp = (c: Collection) => !!p && c.photoIds.includes(p.id);
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
    if (place !== p.place) body.place = place;
    if (desc !== (p.description || '')) body.description = desc;
    if (Object.keys(body).length) await api(`/photos/${p.id}`, { method: 'PATCH', body });
    setDone((d) => d + 1); advance(); todo.reload(); walk.reload(); refreshSummary();
  };
  const v = {
    isTodo: true, isStats: false, isCompare: false, isDupes: false, isNew: false, isWelcome: false,
    todoCount: ids.length.toLocaleString(), todoDone: done, todoWhat: WHAT[reason],
    reasons: REASONS.map(([k, label]) => ({ label, n: (counts[k] ?? 0).toLocaleString(), bg: reason === k ? 'var(--text)' : 'var(--hover)', fg: reason === k ? 'var(--bg)' : 'var(--text2)', go: () => { setReason(k); setSkipped([]); } })),
    tShowCamera: show('camera'), tShowLocation: show('location'), tShowSubjects: show('subjects'), tShowTags: show('tags'), tShowDesc: show('desc'), tShowComp: show('composition'),
    tPhoto: id ? imgUrl(id, 'preview') : '', tTitle: p?.title || p?.file || '', tShoot: shoot?.name ?? '', tIdx: skipped.length + 1,
    tPlace: place, tPlaceHint: shoot?.place ?? '', tPlaceSuggest: !place && !!shoot?.place,
    tCam: [['Body', 'Camera body'], ['Lens', 'Lens'], ['Aperture', 'f/–'], ['Shutter', '1/–'], ['ISO', 'ISO'], ['Film', 'Film stock']].map(([label, ph], i) => ({ label, ph, value: cam[i], ring: cam[i] ? 'var(--outline)' : 'color-mix(in srgb, var(--text) 12%, transparent)', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCam((c) => c.map((x, j) => (j === i ? e.target.value : x))) })),
    tCamMissing: `${cam.filter((x) => !x).length} of 6 missing`, tRollHint: mate ? [mate.camera, mate.lens].filter(Boolean).join(' · ') : '',
    useRoll: () => mate && setCam([mate.camera, mate.lens, mate.aperture ? `f/${mate.aperture}` : '', mate.shutter, mate.iso ? String(mate.iso) : '', mate.film]),
    tTags: chip('tag'), tSubjects: chip('subject'), tShootTags: [...(shoot?.subjects ?? []), ...(shoot?.tags ?? [])].join(', ') || 'none',
    tComps: (colls.data ?? []).filter((c) => !c.printedAt).slice(0, 5).map((c) => { const on = inComp(c); return { name: c.name, why: `${c.layout.prints.length} prints`, tick: on ? '✓' : '', boxBg: on ? 'var(--text)' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 30%, transparent)', go: async () => { await api(`/collections/${c.id}/photos/${p!.id}`, { method: on ? 'DELETE' : 'PUT' }); colls.reload(); } }; }),
    tAiLabel: busy ? 'Analyzing…' : '✦ Analyze with AI', tAiFg: busy ? 'var(--text2)' : 'var(--text)', tAiSpin: null,
    tAnalyze: async () => { if (busy || !p || !ai) return; setBusy(true); try { await api(`/photos/${p.id}/recheck`, { body: {} }); photo.reload(); } finally { setBusy(false); } },
    onPlace: (e: React.ChangeEvent<HTMLInputElement>) => { const q = e.target.value; setPlace(q); window.clearTimeout(timer.current); if (q.trim().length < 3) { setHits([]); return; } timer.current = window.setTimeout(() => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])), 900); },
    placeOpen: hits.length > 0, placeHits: hits.slice(0, 5).map((h) => ({ name: h.name, region: h.address.split(',').slice(-1)[0] ?? '', pick: () => { setPlace(h.name); setHits([]); } })),
    openMap: () => setMapOpen(true), mapLabel: p && p.lat !== null && p.lon !== null ? `On the map · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` : 'Pick on the map', usePlace: () => setPlace(shoot?.place ?? ''),
    tDesc: desc, onDesc: (e: React.ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value), tDescHint: 'Describe the photograph in a sentence', useDesc: () => { const s = p?.aiSuggestion?.description; if (s) setDesc(s); },
    addSubject: (name: string) => tagAct(name, 'subject', 'accept'), addTag: (name: string) => tagAct(name, 'tag', 'accept'),
    skipTodo: advance, saveTodo: save,
  };
  return (
    <div className="page-shell">
      <Header />
      {mapOpen && p && (
        <ProtoMapPicker
          place={p.place || p.lat !== null ? { name: p.place, address: p.placeAddress, kind: p.placeKind, lat: p.lat, lng: p.lon, precision: p.placePrecision, suburb: '', city: '' } : null}
          searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)}
          reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (pl: { name: string; address: string; kind: string; lat: number; lng: number; precision: string }) => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: pl.name, placeAddress: pl.address, placeKind: pl.kind, placePrecision: pl.precision, lat: pl.lat, lon: pl.lng } }); setPlace(pl.name); photo.reload(); todo.reload(); walk.reload(); refreshSummary(); }}
          onRemovePlace={async () => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: '', placeAddress: '', placeKind: '', lat: null, lon: null } }); setPlace(''); photo.reload(); todo.reload(); walk.reload(); refreshSummary(); }}
          onClose={() => setMapOpen(false)} />
      )}
      {id ? <ProtoMore page="todo" v={v} /> : (
        <div style={{ padding: '64px 0' }}><h1 style={{ font: "400 48px/1 'Instrument Serif',Georgia,serif", margin: 0 }}>All caught up</h1><p className="muted">Nothing is waiting for {WHAT[reason]}. <button style={{ textDecoration: 'underline' }} onClick={() => nav('/')}>Back to Home</button></p></div>
      )}
    </div>
  );
}
