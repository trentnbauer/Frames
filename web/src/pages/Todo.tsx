import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { PhotoFull, PhotoLite } from '../data';
import { Header, Justified, Loading } from '../components/bits';
import { useStore } from '../store';

type Item = { key: string; title: string; detail: string; count: number; photoIds: number[]; ids?: number[]; link?: string };
type Todo = { total: number; kinds: number; items: Item[] };
type Need = { tags: boolean; place: boolean; desc: boolean };
type WalkPhoto = { id: number; title: string; ar: number; shoot: string; shootPlace: string; need: Need };
type Walk = { photos: WalkPhoto[]; things: number };

const serif = "'Instrument Serif',Georgia,serif";
const mono = "'IBM Plex Mono',monospace";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' } as const;
const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
const pill = { display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '9px 16px', fontSize: 13, boxShadow: ring, color: '#efede8' } as const;
const plural = (n: number, a: string, b: string) => `${n.toLocaleString()} ${n === 1 ? a : b}`;

/** What is waiting on you: one photograph at a time, showing only what it still needs, or everything as a list. */
export function Todo() {
  const todo = useApi<Todo>('/todo');
  const walk = useApi<Walk>('/todo/walk');
  const { refreshSummary } = useStore();
  const [view, setView] = useState<'focus' | 'list'>('focus');
  const [cur, setCur] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set()); // photographs finished in this sitting
  const photos = walk.data?.photos ?? [];
  const left = photos.filter((p) => !done.has(p.id));
  const things = left.reduce((n, p) => n + +p.need.tags + +p.need.place + +p.need.desc, 0) + (todo.data?.items.find((i) => i.key === 'cloud')?.count ?? 0);
  const start = (id: number) => { const i = photos.findIndex((p) => p.id === id); if (i >= 0) setCur(i); setView('focus'); };
  const tab = (on: boolean) => ({ padding: '6px 14px', borderRadius: 999, fontSize: 13, color: on ? '#efede8' : '#a8a59f', background: on ? 'rgba(255,255,255,.08)' : 'transparent' });
  const reloadAll = () => { todo.reload(); walk.reload(); refreshSummary(); };

  return (
    <div className="page">
      <Header />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <h1 style={{ font: `400 48px/1 ${serif}`, margin: 0 }}>To do</h1>
        {things > 0 && <span style={{ fontSize: 13, color: '#8f8c86' }}>{plural(things, 'thing', 'things')} on {plural(left.length, 'photograph', 'photographs')}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignSelf: 'center' }}>
          <button onClick={() => setView('focus')} style={tab(view === 'focus')}>One at a time</button>
          <button onClick={() => setView('list')} style={tab(view === 'list')}>Everything</button>
        </div>
      </div>
      {(todo.loading || walk.loading) && !todo.data && <Loading error={todo.error} />}
      {todo.data && walk.data && things === 0 && todo.data.items.length === 0 && <div style={{ color: '#8f8c86', padding: '40px 0' }}>Nothing is waiting on you. New photographs, and anything the AI suggests, show up here.</div>}
      {walk.data && view === 'focus' && photos.length > 0 && (
        <Focus photos={photos} cur={Math.min(cur, photos.length - 1)} setCur={setCur} done={done} markDone={(id) => setDone((d) => new Set(d).add(id))} onChange={() => { refreshSummary(); todo.reload(); }} />
      )}
      {view === 'focus' && walk.data && photos.length === 0 && todo.data && todo.data.items.length > 0 && <TodoList items={todo.data.items} start={start} reload={reloadAll} />}
      {view === 'list' && todo.data && <TodoList items={todo.data.items} start={start} reload={reloadAll} />}
    </div>
  );
}

function TodoList({ items, start, reload }: { items: Item[]; start: (id: number) => void; reload: () => void }) {
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const acceptAll = async (kind: 'tags' | 'description', n: number) => {
    if (!window.confirm(`Accept all ${n.toLocaleString()} ${n === 1 ? 'photograph’s' : 'photographs’'} AI suggestions?\n\nThe suggested ${kind === 'tags' ? 'tags and subjects' : 'descriptions'} become yours. You can still remove or edit any of them on the photograph’s page.`)) return;
    await api('/todo/accept-ai', { body: { kind } });
    reload();
  };
  const takeOut = async (ids: number[]) => {
    if (!window.confirm(`Take ${ids.length.toLocaleString()} ${ids.length === 1 ? 'photograph' : 'photographs'} out of Frames?\n\nTheir reviews, tags and composition places go with them. Files in your library folders are not touched; copies Frames holds itself (uploads, cloud copies) are deleted. A scan will not bring them back.`)) return;
    await api('/photos/remove', { body: { ids } });
    reload();
  };
  return (
    <>
      {items.map((i) => {
        const list = i.photoIds.map((id) => byId.get(id)).filter((p): p is PhotoLite => !!p);
        return (
          <section key={i.key} aria-label={i.title} style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
              <h2 style={{ font: `400 28px/1 ${serif}`, margin: 0 }}>{i.title}</h2>
              <span style={{ fontSize: 12.5, color: '#8f8c86' }}>{i.key === 'cloud' ? '' : plural(i.count, 'photograph', 'photographs')}</span>
            </div>
            <p style={{ fontSize: 13, color: '#8f8c86', margin: '6px 0 14px', maxWidth: 640 }}>{i.detail}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {i.link && <Link to={i.link} style={{ ...pill, background: '#efede8', color: '#0d0d0d', fontWeight: 500 }}>Open</Link>}
              {i.key !== 'cloud' && i.key !== 'delete' && i.photoIds[0] && <button onClick={() => start(i.photoIds[0])} style={{ ...pill, background: '#efede8', color: '#0d0d0d', fontWeight: 500 }}>Go through them one by one</button>}
              {i.key === 'delete' && <button style={{ ...pill, background: '#efede8', color: '#0d0d0d', fontWeight: 500 }} onClick={() => takeOut(i.ids ?? i.photoIds)}>Take all {i.count.toLocaleString()} out of Frames</button>}
              {i.key === 'delete' && i.photoIds[0] && <Link to={`/photo/${i.photoIds[0]}`} style={pill}>Look at the first</Link>}
              {(i.key === 'ai-tags' || i.key === 'ai-description') && <button style={pill} onClick={() => acceptAll(i.key === 'ai-tags' ? 'tags' : 'description', i.count)}>Accept all {i.count.toLocaleString()}</button>}
              {(i.key === 'subjects' || i.key === 'tags') && <Link to={`/library?missing=${i.key === 'subjects' ? 'subject' : 'tag'}`} style={pill}>See all {i.count.toLocaleString()} in the Library</Link>}
            </div>
            {list.length > 0 && <Justified photos={list} h={110} onPick={(p) => start(p.id)} />}
          </section>
        );
      })}
    </>
  );
}

/** A photograph with only the parts that still need doing. */
function Focus({ photos, cur, setCur, done, markDone, onChange }: { photos: WalkPhoto[]; cur: number; setCur: (n: number) => void; done: Set<number>; markDone: (id: number) => void; onChange: () => void }) {
  const { settings } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const w = photos[cur];
  const photo = useApi<PhotoFull>(`/photos/${w.id}`);
  const p = photo.data;
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState({ subject: '', tag: '', place: '', desc: '' });
  const [msg, setMsg] = useState('');
  const [checking, setChecking] = useState(false);
  const adv = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A fresh photograph: sections closed again, boxes empty.
  useEffect(() => { setEdit({}); setMsg(''); setChecking(false); setDraft({ subject: '', tag: '', place: '', desc: '' }); clearTimeout(adv.current); }, [w.id]);
  useEffect(() => { if (p) setDraft((d) => ({ ...d, place: p.place, desc: p.description })); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = (kind: 'subject' | 'tag') => (p?.tags ?? []).filter((t) => t.kind === kind && t.accepted);
  const sugg = (kind: 'subject' | 'tag') => (ai ? (p?.tags ?? []).filter((t) => t.kind === kind && !t.accepted && t.source === 'ai') : []);
  const sug = p?.aiSuggestion;
  const aiDesc = ai && !!sug?.description && p?.descSource !== 'user' && !p?.description ? sug!.description : '';
  const isDone = {
    tags: !!p && sugg('subject').length + sugg('tag').length === 0 && mine('subject').length > 0 && mine('tag').length > 0,
    place: !!p && !!p.place.trim(),
    desc: !!p && !!p.description.trim(),
  };
  const open = (['tags', 'place', 'desc'] as const).filter((k) => w.need[k] && p && !isDone[k]);
  const allDone = !!p && open.length === 0;
  const remaining = photos.filter((x) => !done.has(x.id));
  const go = useCallback((d: number) => setCur((cur + d + photos.length) % photos.length), [cur, photos.length, setCur]);
  const next = useCallback(() => {
    for (let k = 1; k <= photos.length; k++) { const i = (cur + k) % photos.length; if (!done.has(photos[i].id) && i !== cur) { setCur(i); return; } }
  }, [cur, photos, done, setCur]);

  const reload = async () => { photo.reload(); onChange(); };
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${w.id}/tags`, { method: 'PUT', body: { name, kind, action } }); await reload(); };
  const patch = async (body: Record<string, unknown>) => { await api(`/photos/${w.id}`, { method: 'PATCH', body }); await reload(); };
  const acceptAll = async () => {
    const all = [...sugg('subject'), ...sugg('tag')];
    if (!all.length) return;
    for (const t of all) await api(`/photos/${w.id}/tags`, { method: 'PUT', body: { name: t.name, kind: t.kind, action: 'add' } });
    await reload();
  };
  const addTag = async (kind: 'subject' | 'tag') => { const v = draft[kind].trim().toLowerCase(); if (!v) return; setDraft((d) => ({ ...d, [kind]: '' })); await tagAct(v, kind, 'add'); };
  const savePlace = async (v = draft.place) => { const val = v.trim(); if (p && val !== p.place) await patch({ place: val }); setEdit((e) => ({ ...e, place: false })); };
  const saveDesc = async () => { const val = draft.desc.trim(); if (p && val !== p.description) await patch({ description: val }); setEdit((e) => ({ ...e, desc: false })); };
  const recheck = async () => {
    if (checking) return;
    setChecking(true); setMsg('');
    try {
      const r = await api<{ ai: boolean; added: string[]; descriptionChanged: boolean; error?: string }>(`/photos/${w.id}/recheck`, { body: {} });
      await reload();
      setMsg(r.error ? r.error : !r.ai ? 'AI is off. Turn it on in Settings, Your AI.' : r.added.length ? `The AI suggested ${r.added.map((x) => `“${x}”`).join(' and ')}.` : 'Nothing new from the AI.');
    } catch (e) { setMsg((e as Error).message); } finally { setChecking(false); }
  };

  // When the last thing on a photograph is done, note it and move on after a moment.
  const was = useRef(false);
  useEffect(() => {
    if (allDone && !was.current) {
      markDone(w.id);
      if (remaining.filter((x) => x.id !== w.id).length) { clearTimeout(adv.current); adv.current = setTimeout(next, 700); }
    }
    was.current = allDone;
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { was.current = false; }, [w.id]);
  useEffect(() => () => clearTimeout(adv.current), []);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key.toLowerCase() === 'a' && !e.metaKey && !e.ctrlKey) void acceptAll();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const leftN = open.length;
  const isLast = remaining.length === 1 && remaining[0].id === w.id;
  const nextLabel = isLast ? (leftN ? 'Finish later' : 'Done') : leftN ? 'Next photograph →' : 'Done · next photograph →';
  const sugCount = sugg('subject').length + sugg('tag').length;
  const sectionBox = (k: 'tags' | 'place' | 'desc', label: string, summary: string, body: React.ReactNode) => {
    if (!w.need[k]) return null;
    if (isDone[k] && !edit[k]) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,.08)', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <span>✓</span><span style={{ flex: 'none' }}>{label}</span>
          <span style={{ flex: 1, minWidth: 0, color: '#8f8c86', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{summary}</span>
          <button onClick={() => setEdit((e) => ({ ...e, [k]: true }))} style={{ color: '#a8a59f', fontSize: 12.5 }}>Edit</button>
        </div>
      );
    }
    return <>{body}</>;
  };
  const chip = (t: { name: string }, kind: 'subject' | 'tag') => <span key={t.name} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, background: 'rgba(255,255,255,.08)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>{t.name}<button aria-label={`Remove ${t.name}`} onClick={() => tagAct(t.name, kind, 'remove')} style={{ color: '#8f8c86' }}>✕</button></span>;
  const sugChip = (t: { name: string }, kind: 'subject' | 'tag') => <span key={t.name} title="Suggested by the AI" style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, border: '1px dashed rgba(255,255,255,.35)', display: 'inline-flex', gap: 6, alignItems: 'center', color: '#a8a59f' }}>{t.name}<button aria-label={`Accept ${t.name}`} onClick={() => tagAct(t.name, kind, 'add')} style={{ color: '#efede8' }}>✓</button><button aria-label={`Reject ${t.name}`} onClick={() => tagAct(t.name, kind, 'reject')}>✕</button></span>;
  const addBox = (kind: 'subject' | 'tag', width: number) => <input value={draft[kind]} onChange={(e) => setDraft((d) => ({ ...d, [kind]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTag(kind); } }} placeholder={`+ ${kind === 'subject' ? 'Subject' : 'Tag'}`} aria-label={`Add a ${kind}`} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, width, background: 'none', border: 0, outline: 'none', boxShadow: ring, color: '#efede8' }} />;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
        <Link to={`/photo/${w.id}`} style={{ color: '#a8a59f' }}>{w.shoot} · open the full photo page</Link>
        <span style={{ display: 'flex', gap: 18, color: '#a8a59f', alignItems: 'baseline' }}>
          <button onClick={() => go(-1)}>← Previous</button>
          <span style={{ color: '#6f6c67' }}>{cur + 1} of {photos.length}</span>
          <button onClick={() => go(1)}>Next →</button>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0, position: 'sticky', top: 16 }}>
          <div style={{ background: '#000', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 330px)', minHeight: 360, padding: 16 }}>
            <img src={imgUrl(w.id, 'preview')} alt={w.title} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, height: 54, marginTop: 12, overflow: 'hidden' }}>
            {photos.slice(0, 80).map((q, i) => (
              <button key={q.id} onClick={() => setCur(i)} aria-label={q.title} style={{ height: '100%', flex: 'none', aspectRatio: String(q.ar), borderRadius: 3, overflow: 'hidden', opacity: i === cur ? 1 : done.has(q.id) ? 0.3 : 0.5, outline: i === cur ? '1px solid #efede8' : 'none', outlineOffset: 2, position: 'relative' }}>
                <img src={imgUrl(q.id, 'thumb')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {done.has(q.id) && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: 'rgba(0,0,0,.35)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        <aside style={{ width: 340, flex: 'none', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ font: `400 40px/1 ${serif}` }}>{w.title}</div>
            <div style={{ fontSize: 13, color: '#a8a59f', marginTop: 6 }}>{p?.place ? `${w.shoot} · ${p.place}` : w.shoot}</div>
            <div style={{ fontSize: 12.5, color: '#8f8c86', marginTop: 10 }}>{!p ? 'Loading…' : leftN ? `${plural(leftN, 'thing', 'things')} left on this one` : 'All done here.'}</div>
          </div>

          {p && sectionBox('tags', 'Subjects & tags', [...mine('subject'), ...mine('tag')].map((t) => t.name).join(', '), (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <div style={eyebrow}>Subjects &amp; tags</div>
                {sugCount > 0 && <button onClick={acceptAll} style={{ fontSize: 12, color: '#a8a59f' }}>Accept all {sugCount}</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '62px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
                <span style={{ fontSize: 12.5, color: '#8f8c86', paddingTop: 5 }}>Subjects</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{mine('subject').map((t) => chip(t, 'subject'))}{sugg('subject').map((t) => sugChip(t, 'subject'))}{addBox('subject', 104)}</div>
                <span style={{ fontSize: 12.5, color: '#8f8c86', paddingTop: 5 }}>Tags</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{mine('tag').map((t) => chip(t, 'tag'))}{sugg('tag').map((t) => sugChip(t, 'tag'))}{addBox('tag', 84)}</div>
              </div>
              {sugCount > 0 && <div style={{ fontSize: 12, color: '#6f6c67', marginTop: 10 }}>Dashed ones are the AI’s. Nothing is kept until you accept it.</div>}
            </div>
          ))}

          {p && sectionBox('place', 'Place', p.place, (
            <div>
              <div style={{ ...eyebrow, marginBottom: 10 }}>Place</div>
              <input value={draft.place} onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void savePlace(); } }} onBlur={() => void savePlace()} placeholder="Name this place" aria-label="Place" style={{ width: '100%', background: '#161615', border: 0, borderRadius: 8, padding: '8px 10px', fontSize: 13.5, color: '#efede8', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {w.shootPlace && w.shootPlace !== p.place && <button onClick={() => { setDraft((d) => ({ ...d, place: w.shootPlace })); void savePlace(w.shootPlace); }} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, boxShadow: ring, color: '#a8a59f' }}>Use the shoot’s: {w.shootPlace}</button>}
                {p.lat !== null && p.lon !== null && <span style={{ font: `400 11.5px ${mono}`, color: '#6f6c67' }}>{Math.abs(p.lat).toFixed(4)}°{p.lat < 0 ? 'S' : 'N'}, {Math.abs(p.lon).toFixed(4)}°{p.lon < 0 ? 'W' : 'E'}</span>}
              </div>
            </div>
          ))}

          {p && sectionBox('desc', 'Description', p.description, (
            <div>
              <div style={{ ...eyebrow, marginBottom: 10 }}>Description</div>
              {aiDesc && (
                <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: '12px 14px', marginBottom: 10, fontSize: 13.5, lineHeight: 1.45, color: '#a8a59f' }}>
                  <div style={{ ...eyebrow, marginBottom: 6 }}>AI description</div>
                  <p style={{ margin: '0 0 10px' }}>{aiDesc}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={pill} onClick={async () => { await patch({ acceptAiDescription: true }); setEdit((e) => ({ ...e, desc: false })); }}>Use this</button>
                    <button style={pill} onClick={() => patch({ rejectAiDescription: true })}>Reject</button>
                  </div>
                </div>
              )}
              <textarea value={draft.desc} onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} onBlur={() => void saveDesc()} rows={3} placeholder={aiDesc ? 'Or write your own' : 'Add a description'} aria-label="Description" style={{ width: '100%', background: '#161615', border: 0, outline: 'none', borderRadius: 8, padding: '8px 10px', font: "400 13.5px/1.45 'IBM Plex Sans',system-ui,sans-serif", resize: 'vertical', color: '#efede8' }} />
            </div>
          ))}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => (allDone || !isLast ? next() : undefined)} style={{ width: '100%', background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>{nextLabel}</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              {ai && <button onClick={recheck} disabled={checking} style={pill}>{checking ? 'Checking…' : 'Re-check with AI'}</button>}
              <button onClick={() => go(1)} style={{ fontSize: 12.5, color: '#8f8c86', marginLeft: 'auto' }}>Skip for now</button>
            </div>
            {msg && <div role="status" style={{ fontSize: 12.5, color: '#8f8c86' }}>{msg}</div>}
            <div style={{ fontSize: 12, color: '#6f6c67' }}>← → move between photographs{ai ? ' · A accepts every suggestion' : ''}</div>
          </div>
        </aside>
      </div>
    </>
  );
}
