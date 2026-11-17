import { SameShootGear, sameShootGear } from '../components/SameShootGear';
import { RotateButton } from '../components/RotateButton';
import { TodoGearInput, type GearChoice } from '../components/TodoGearInput';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoFull, PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import ProtoMore from '../proto/ProtoMore';
import { AddToComposition } from '../components/AddToComposition';
import { RemovalReview } from '../components/RemovalReview';
import ProtoMapPicker from '../proto/ProtoMapPicker';
import { TASKS, buildTasks, taskMeta, unacceptedAiTags, type TaskKey } from '../todoTasks';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileTodoList } from '../mobile/TodoList';
import { OrphanTodo } from '../desktop/OrphanTodo';

type Todo = { total: number; items: { key: string; count: number; ids?: number[] }[] };
type MapHit = { name: string; address: string; kind?: string; suburb?: string; city?: string; lat?: number; lon?: number };

/** Why a photograph is waiting, in one line, for the kind of task on show. */
const WHY: Record<string, (p: PhotoFull | null, extra: { camMissing: number; tags: number }) => string> = {
  delete: () => 'Below your removal threshold after its review sessions.',
  'ai-tags': (_p, x) => `AI suggested ${x.tags} tags for this photo. Accept the ones that fit; saving rejects the rest.`,
  tags: () => 'This photo has no tags yet. Tags make it findable in Library and Search.',
  'ai-desc': () => 'AI wrote a description for this photo. Use it as is, edit it, or write your own.',
  desc: () => 'This photo has no description yet. One sentence is enough.',
  location: () => 'No location is recorded for this photo.',
  camera: (_p, x) => `${x.camMissing} of 6 camera details are missing from this photo’s metadata.`,
  time: () => 'No capture time is recorded for this photograph.',
  light: () => 'The AI’s analysis has no note about the light.',
  mood: () => 'The AI’s analysis has no note about the mood.',
  composition: () => 'This photo is not part of any composition yet.',
};

/** To do: one task at a time, full screen. A photograph shows only the most important thing it is waiting on. */
/** On a phone, To do opens as a list of the kinds of task; choosing one (or being on a wide screen) goes to the one-at-a-time view. */
export function TodoPage() {
  const phone = usePhoneWidth();
  const [params] = useSearchParams();
  if (params.get('task') === 'orphaned') return phone ? <Navigate to="/library?f=noshoot&select=1" replace /> : <OrphanTodo />; // a list to choose from, not one-at-a-time cards
  return phone && !params.get('task') ? <MobileTodoList /> : <TodoTasks />;
}

function TodoTasks() {
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const todo = useApi<Todo>('/todo');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const shoots = useApi<Shoot[]>('/shoots');
  const gear = useApi<{ own: GearChoice[]; found: GearChoice[] }>('/gear/items');
  const colls = useApi<Collection[]>('/collections');
  const [params, setParams] = useSearchParams();
  const tasks = useMemo(() => buildTasks(todo.data?.items ?? []), [todo.data]);
  const wanted = params.get('task') ?? 'all';
  const mode: TaskKey | 'all' = TASKS.some((t) => t.key === wanted) ? (wanted as TaskKey) : 'all';
  const [skipped, setSkipped] = useState<number[]>([]);
  const [done, setDone] = useState(0);
  const [cam, setCam] = useState<string[]>(['', '', '', '', '', '']);
  const [desc, setDesc] = useState('');
  const [notes, setNotes] = useState({ light: '', mood: '' });
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  useEffect(() => { setSkipped([]); }, [mode]);
  const reload = () => { todo.reload(); refreshSummary(); };

  // Skipped photographs go to the back of the line.
  const line = tasks.queue(mode);
  const queue = [...line.filter((i) => !skipped.includes(i)), ...line.filter((i) => skipped.includes(i))];
  const id = queue[0];
  const r: string | null = id ? (mode === 'all' ? tasks.byPhoto.get(id)?.[0] ?? null : mode) : null;
  const later = id ? (tasks.byPhoto.get(id) ?? []).filter((k) => k !== r).map((k) => taskMeta(k)!.later) : [];
  const photo = useApi<PhotoFull>(id && r !== 'delete' ? `/photos/${id}` : null);
  const p = photo.data && photo.data.id === id ? photo.data : null;
  const shoot = shoots.data?.find((sh) => sh.id === p?.shootId);
  const suggestedGear = sameShootGear(lib.data?.photos ?? [], p);

  useEffect(() => {
    if (!p) return;
    setCam([p.camera, p.lens, p.aperture ? `f/${p.aperture}` : '', p.shutter, p.iso ? String(p.iso) : '', p.film]);
    setDesc(p.description || '');
    setNotes({ light: p.aiSuggestion?.lighting ?? '', mood: p.aiSuggestion?.mood ?? '' });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The screen covers the app, like Removal review: Escape or Back returns.
  const leave = () => { refreshSummary(); nav('/'); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement | null)?.closest('input, textarea')) leave(); };
    document.title = 'To do · Frames';
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', key); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const left = line.length;
  const progress = `${left.toLocaleString()} ${left === 1 ? 'photo' : 'photos'} waiting · ${done} done today`;
  const frame = (body: React.ReactNode) => (
    <main className="removal-screen todo-screen">
      <div className="spread" style={{ alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <h1 className="serif" style={{ fontSize: 36, lineHeight: 1, margin: 0, fontWeight: 400 }}>To do</h1>
          <span className="muted" style={{ fontSize: 13 }}>{progress}</span>
          {mode !== 'all' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 28, padding: '0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 12.5 }}>{taskMeta(mode)!.row}<button aria-label="Show every task" style={{ color: 'var(--muted)' }} onClick={() => setParams({})}>✕</button></span>}
        </div>
        <button className="btn outline" onClick={leave}>Back</button>
      </div>
      {body}
    </main>
  );

  if (!todo.data) return frame(null);
  if (!id) {
    return frame(
      <div style={{ padding: '64px 0' }}><h2 className="serif" style={{ fontSize: 48, lineHeight: 1, margin: 0, fontWeight: 400 }}>All caught up</h2>
        <p className="muted">{mode === 'all' ? 'Nothing is waiting.' : `Nothing left to ${taskMeta(mode)!.row.toLowerCase()}.`} <button style={{ textDecoration: 'underline' }} onClick={() => (mode === 'all' || !tasks.rows.length ? leave() : setParams({}))}>{mode === 'all' || !tasks.rows.length ? 'Back to Home' : 'Show every task'}</button></p></div>,
    );
  }
  // Removal outranks everything: a photograph waiting on removal only ever shows the removal screen.
  if (r === 'delete') return frame(<RemovalReview onChanged={reload} />);

  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p!.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); };
  const chip = (kind: 'subject' | 'tag') => (p?.tags ?? []).filter((t) => t.kind === kind && !(kind === 'tag' && t.source === 'gear')).map((t) => ({ label: t.accepted ? t.name : `✦ ${t.name}`, bg: t.accepted ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', fg: t.accepted ? 'var(--text)' : 'var(--ai-active)', ring: t.accepted ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--ai-active) 55%, transparent)', go: () => tagAct(t.name, t.kind, t.accepted ? 'remove' : 'accept'), reject: t.accepted || t.source !== 'ai' ? null : () => tagAct(t.name, t.kind, 'reject') }));
  // "Accept all": every ✦ suggestion of this kind becomes the photograph's own, in one click.
  const acceptAll = (kind: 'subject' | 'tag') => {
    const waiting = (p?.tags ?? []).filter((t) => t.kind === kind && t.source === 'ai' && !t.accepted);
    return waiting.length > 1 ? <button onClick={async () => { for (const t of waiting) await api(`/photos/${p!.id}/tags`, { method: 'PUT', body: { name: t.name, kind, action: 'accept' } }); photo.reload(); }} style={{ height: 26, padding: '0 12px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)' }}>Accept all {waiting.length}</button> : null;
  };
  const skip = () => setSkipped((sk) => (id ? [...sk.filter((x) => x !== id), id] : sk));
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
    if (notes.light !== (p.aiSuggestion?.lighting ?? '')) body.lighting = notes.light;
    if (notes.mood !== (p.aiSuggestion?.mood ?? '')) body.mood = notes.mood;
    if (Object.keys(body).length) await api(`/photos/${p.id}`, { method: 'PATCH', body });
    // Saving is the answer for the AI tags too: any not accepted are rejected, so the user only approves the ones they want.
    if (r === 'ai-tags') for (const t of unacceptedAiTags(p.tags ?? [])) await api(`/photos/${p.id}/tags`, { method: 'PUT', body: { name: t.name, kind: t.kind, action: 'reject' } });
    setDone((d) => d + 1); skip(); reload();
  };
  const camMissing = cam.filter((x) => !x).length;
  const meta = taskMeta(r!)!;
  const v = {
    isTodo: true, isStats: false, isCompare: false, isDupes: false, isNew: false, isWelcome: false,
    tEyebrow: r!.startsWith('ai-') ? '✦ Waiting on you' : 'Missing', tEyebrowFg: r!.startsWith('ai-') ? 'var(--ai-active)' : 'var(--faint)', tReasonTitle: meta.title, tWhy: WHY[r!](p, { camMissing, tags: (p?.tags ?? []).filter((t) => t.source === 'ai' && !t.accepted).length }),
    tLater: later.length ? `This photo comes back later for ${later.join(' and ')}.` : '',
    tShowCamera: r === 'camera', tShowLocation: r === 'location', tShowSubjects: r === 'ai-tags' || r === 'tags', tShowTags: r === 'ai-tags' || r === 'tags', tShowDesc: r === 'desc' || r === 'ai-desc',
    tNotes: ([['light', 'Light', 'Soft, low side light'], ['mood', 'Mood', 'Calm']] as const).filter(([k]) => r === k).map(([k, label, ph]) => ({ label, ph, value: notes[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setNotes((n) => ({ ...n, [k]: e.target.value })) })),
    tTimeNote: r === 'time' && p ? 'Set its date on the photo page.' : '', tOpenPhoto: () => { if (p) nav(`/photo/${p.id}`); }, tShowComp: r === 'composition',
    tPhoto: id ? imgUrl(id, 'preview') : '', tRotate: p ? <RotateButton id={p.id} onDone={() => photo.reload()} style={{ position: 'absolute', top: 12, right: 12 }} /> : null, tTitle: p?.title || p?.file || '', tShoot: shoot?.name ?? '',
    tCam: [['Body', 'Camera body'], ['Lens', 'Lens'], ['Aperture', 'f/–'], ['Shutter', '1/–'], ['ISO', 'ISO'], ['Film', 'Film stock']].map(([label, ph], i) => ({ label, ph, control: [0, 1, 5].includes(i) ? <TodoGearInput key={`${id}-${i}`} value={cam[i]} type={i === 0 ? 'camera' : i === 1 ? 'lens' : 'film'} placeholder={ph} owned={gear.data?.own ?? []} discovered={gear.data?.found ?? []} onChange={(value) => setCam((current) => current.map((item, index) => index === i ? value : item))} /> : null, value: cam[i], ring: cam[i] ? 'var(--outline)' : 'color-mix(in srgb, var(--text) 12%, transparent)', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCam((c) => c.map((x, j) => (j === i ? e.target.value : x))) })),
    tCamMissing: `${camMissing} of 6 missing`,
    tGearHints: <SameShootGear camera={cam[0] === suggestedGear.camera ? '' : suggestedGear.camera} lens={cam[1] === suggestedGear.lens ? '' : suggestedGear.lens} onUse={(field, value) => setCam((current) => current.map((item, index) => index === (field === 'camera' ? 0 : 1) ? value : item))} />,
    tTags: chip('tag'), tSubjects: chip('subject'), tAcceptTags: acceptAll('tag'), tAcceptSubjects: acceptAll('subject'), tShootTags: [...(shoot?.subjects ?? []), ...(shoot?.tags ?? [])].join(', ') || 'none',
    tComps: [], tCompPicker: p ? <AddToComposition key={p.id} ids={[p.id]} label="Add to composition" onDone={() => { colls.reload(); reload(); }} /> : null,
    tAiLabel: busy ? 'Analysing…' : '✦ Analyse with AI', tAiFg: busy ? 'var(--text2)' : 'var(--ai-active)', tAiSpin: null,
    tAnalyze: async () => { if (busy || !p || !ai) return; setBusy(true); try { await api(`/photos/${p.id}/recheck`, { body: {} }); photo.reload(); } finally { setBusy(false); } },
    openMap: () => setMapOpen(true), mapLabel: p && p.lat !== null && p.lon !== null ? p.place.trim() || `On the map · ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}` : 'Pick on the map',
    tDesc: desc, onDesc: (e: React.ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value), tDescHint: 'Describe the photograph in a sentence', useDesc: () => { const sg = p?.aiSuggestion?.description; if (sg) setDesc(sg); },
    addSubject: (name: string) => tagAct(name, 'subject', 'accept'), addTag: (name: string) => tagAct(name, 'tag', 'accept'),
    skipTodo: skip, saveTodo: () => save(),
  };
  return frame(
    <>
      {mapOpen && p && (
        <ProtoMapPicker
          place={p.place || p.lat !== null ? { name: p.place, address: p.placeAddress, kind: p.placeKind, lat: p.lat, lng: p.lon, precision: p.placePrecision, suburb: '', city: '' } : null}
          searchPlaces={async (q: string) => api<MapHit[]>(`/map/search?q=${encodeURIComponent(q)}`)}
          reversePlace={async (lat: number, lon: number) => api<MapHit>(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (pl: { name: string; address: string; kind: string; lat: number; lng: number; precision: string }) => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: pl.name, placeAddress: pl.address, placeKind: pl.kind, placePrecision: pl.precision, lat: pl.lat, lon: pl.lng } }); photo.reload(); reload(); }}
          onRemovePlace={async () => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { place: '', placeAddress: '', placeKind: '', lat: null, lon: null } }); photo.reload(); reload(); }}
          onClose={() => setMapOpen(false)} />
      )}
      <ProtoMore page="todo" v={v} />
    </>,
  );
}
