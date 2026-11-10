import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { RATINGS, fmtCoord, fmtDate, requiredPx, type Collection, type PhotoFull, type PhotoLite, type Shoot } from '../data';
import { PAPER_MM } from '../target';
import { Header, Img, Loading, Swatches, useField, useKey, useTitle } from '../components/bits';
import { useStore } from '../store';
import { useUi } from '../ui';
import { MapPin } from '../components/MapPin';
import { GearRows } from '../components/GearRows';
import { CompPicker } from '../components/AddToComposition';
import { seasonOf, type Hemisphere } from '../season';

const serif = "'Instrument Serif',Georgia,serif";
const mono = "'IBM Plex Mono',monospace";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 } as const;
const ring = 'inset 0 0 0 1px var(--outline)';
const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(1));
const day = (iso: string | null) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

export function PhotoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { openNew } = useUi();
  const { settings, refreshSummary } = useStore();
  const photo = useApi<PhotoFull>(`/photos/${id}`);
  useTitle(photo.data?.title ?? 'Photograph');
  const shoots = useApi<Shoot[]>('/shoots');
  const places = useApi<{ name: string; n: number }[]>('/places');
  const all = useApi<{ photos: PhotoLite[] }>('/photos');
  const similar = useApi<PhotoLite[]>(`/photos/${id}/similar?limit=8`);
  const inPf = useApi<{ state: 'in' | 'auto' | 'none'; inPortfolio: boolean; favourite: boolean; score: number | null }>(`/portfolio/photos/${id}`);
  const profile = useApi<{ hemisphere: Hemisphere }>('/profile');
  const [more, setMore] = useState(false);
  const colls = useApi<Collection[]>('/collections');
  const guests = useApi<{ avg: number | null; n: number }>(`/photos/${id}/guests`);
  const comments = useApi<{ comments: { id: number; by: string; body: string; at: string }[] }>(`/photos/${id}/comments`);
  const [msg, setMsg] = useState('');
  const [compOpen, setCompOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  // Opened from the To do list: Previous and Next walk what still needs doing, not the whole library.
  const [qs] = useSearchParams();
  const todoKey = qs.get('todo');
  const todo = useApi<{ items: { key: string; ids?: number[] }[] }>(todoKey ? '/todo' : null);
  const snapshot = useRef<number[] | null>(null); // the list as it was when this page was opened, so the order does not shuffle as items are done
  const live = todo.data?.items.find((i) => i.key === todoKey)?.ids ?? null;
  if (todoKey && live && !snapshot.current) snapshot.current = live;
  const p = photo.data;
  // Each field follows the server only when its own value changes, so a refresh never wipes text being typed elsewhere.
  const [title, setTitle] = useField(p?.title ?? '', p?.id);
  const [desc, setDesc] = useField(p?.description ?? '', p?.id);
  const [place, setPlace] = useField(p?.place ?? '', p?.id);
  useEffect(() => setMsg(''), [p?.id]);

  const here = Number(id);
  const libList = all.data?.photos ?? [];
  // In the To do walk: skip photographs already dealt with (no longer on the live list), but keep the order from when it was opened.
  const walk = todoKey ? (snapshot.current ?? []).filter((x) => x === here || !live || live.includes(x)) : null;
  const list = libList;
  const stepIds = walk ?? libList.map((x) => x.id);
  const idx = stepIds.indexOf(here);
  const go = (d: number) => {
    if (!stepIds.length) return;
    const n = stepIds[(idx + d + stepIds.length) % stepIds.length];
    nav(`/photo/${n}${todoKey ? `?todo=${todoKey}` : ''}`);
  };
  // Back goes to where you were (keeping the library's scroll place) when you came from inside the app.
  const back = () => { if ((window.history.state?.idx ?? 0) > 0) nav(-1); else nav(todoKey ? '/todo' : shoot ? `/shoots/${shoot.id}` : '/library'); };
  useKey((e) => { if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return; if (e.key === 'Escape') back(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }, [idx, stepIds.length]);

  if (!p) return <div className="page"><Header /><Loading error={photo.error} /></div>;
  const ai = !!settings && settings.ai !== 'off';
  const shoot = shoots.data?.find((s) => s.id === p.shootId);
  const mates = list.filter((x) => x.shootId === p.shootId);
  const rs = p.reviews;
  const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null;
  const g = guests.data;
  // Combined score: yours, blended with guests' if there are any (the same weight as in a composition).
  const score = avg !== null && g?.avg != null ? avg * 0.65 + g.avg * 0.35 : avg ?? g?.avg ?? null;
  const rankInShoot = avg === null ? null : 1 + mates.filter((x) => x.reviewCount > 0 && x.avgRating > avg).length;
  const emoji = (n: number) => RATINGS[n - 1].emoji;
  const patch = async (body: Record<string, unknown>, ok?: string) => { await api(`/photos/${p.id}`, { method: 'PATCH', body }); photo.reload(); if (ok) setMsg(ok); };
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); refreshSummary(); };
  const sug = p.aiSuggestion;
  const showAiDescription = ai && sug && sug.description && p.descSource !== 'user';
  const inComp = (c: Collection) => c.photoIds.includes(p.id);
  const inCount = (colls.data ?? []).filter(inComp).length;
  const toggleComp = async (c: Collection) => { await api(`/collections/${c.id}/photos/${p.id}`, { method: inComp(c) ? 'DELETE' : 'PUT' }); colls.reload(); };
  const fits = (['A4', 'A3', 'A2'] as const).map((size) => {
    const r = requiredPx({ size, ppi: 300, count: 1, orientation: 'any' }) ?? [0, 0];
    const portrait = p.h > p.w;
    const [nw, nh] = portrait ? [r[0], r[1]] : [r[1], r[0]];
    const ok = p.w >= nw && p.h >= nh;
    const [a, b] = PAPER_MM[size];
    const maxPpi = Math.floor(Math.min(p.w / (portrait ? a : b), p.h / (portrait ? b : a)) * 25.4);
    return { size, ok, note: ok ? 'Sharp' : `${maxPpi} PPI max` };
  });
  const tagsOf = (kind: 'tag' | 'subject') => p.tags.filter((t) => t.kind === kind && t.accepted);
  const suggested = ai ? p.tags.filter((t) => !t.accepted && t.source === 'ai') : [];
  const stateOf = (c: Collection) => {
    if (c.printedAt) return `Printed ${day(c.printedAt)}`;
    const slot = c.chosenIds.indexOf(p.id);
    if (slot >= 0) return `Chosen for print ${slot + 1} of ${c.target?.count ?? c.chosenIds.length}`;
    if (inComp(c)) return `Candidate · ${c.photoIds.length} candidates`;
    return c.target ? `${c.target.count} × ${c.target.size} · ${c.photoIds.length} candidates` : `${c.photoIds.length} photographs`;
  };

  return (
    <div className="page">
      <Header />
      <div className="photo-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Link to={todoKey ? '/todo' : shoot ? `/shoots/${shoot.id}` : '/library'} onClick={(e) => { e.preventDefault(); back(); }} style={{ color: 'var(--text2)' }}>← {todoKey ? 'To do' : shoot ? shoot.name : 'Library'}</Link>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text2)' }}>
            <button aria-label="Previous photograph" onClick={() => go(-1)}>←</button>
            {idx >= 0 && <span className="faint">{idx + 1} of {stepIds.length}</span>}
            <button aria-label="Next photograph" onClick={() => go(1)}>→</button>
          </span>
        </span>
        <span className="photo-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
          <Link to={`/library?similarTo=${p.id}`} className="btn outline" style={{ height: 36 }}>Find similar</Link>
          <span className="splitbtn" role="group" aria-label="Portfolio">
            <button title={inPf.data?.state === 'auto' ? 'Added by your score rule. Click to keep it out.' : undefined} onClick={async () => { const st = inPf.data?.state; await api(`/portfolio/photos/${p.id}`, { body: { on: st === 'none' } }); inPf.reload(); setMsg(st === 'none' ? 'Added to your portfolio.' : st === 'auto' ? 'Kept out of your portfolio. The score rule will not add it again.' : 'Taken out of your portfolio.'); }}>
              <i className={'pdot ' + (inPf.data?.state === 'in' ? 'in' : inPf.data?.state === 'auto' ? 'auto' : '')} />
              {inPf.data?.state === 'in' ? 'In portfolio' : inPf.data?.state === 'auto' ? `Auto · score ${inPf.data.score?.toFixed(1)}` : 'Add to portfolio'}
            </button>
            <button aria-pressed={!!inPf.data?.favourite} aria-label={inPf.data?.favourite ? 'Remove favourite' : 'Favourite (also adds it to your portfolio)'} onClick={async () => { await api(`/portfolio/photos/${p.id}`, { body: { favourite: !inPf.data?.favourite } }); inPf.reload(); }}>{inPf.data?.favourite ? '★' : '☆'}</button>
          </span>
          {ai && <button className="btn outline" style={{ height: 36 }} onClick={() => patch({ reanalyse: true }, 'Analysing with AI…')} disabled={p.aiStatus === 'pending'}>{p.aiStatus === 'pending' ? <><span className="spin" style={{ width: 12, height: 12 }} /> Analysing…</> : 'Analyze with AI'}</button>}
          <button className="iconbtn" aria-label="More" aria-expanded={more} onClick={() => setMore(!more)} style={{ boxShadow: 'inset 0 0 0 1px var(--outline)' }}>⋯</button>
          {more && (<><div className="pop-scrim" onClick={() => setMore(false)} /><div className="popover" style={{ right: 0, top: 42, width: 240 }} role="menu">
            {similar.data?.[0] && <Link className="mi" to={`/compare?a=${p.id}&b=${similar.data[0].id}`}>Compare with the closest match</Link>}
            <a className="mi" href={`/api/photos/${p.id}/original`} download>Download original</a>
            <a className="mi" href={`/api/photos/${p.id}/xmp`} download>Export XMP</a>
            <button className="mi" onClick={async () => { setMore(false); await patch({ reviewAgain: true }, 'Queued for review.'); refreshSummary(); }}>Review again</button>
            <button className="mi" onClick={() => { setMore(false); patch({ archived: !p.archived }, p.archived ? 'Back in review.' : 'Left out of review. It still shows everywhere else.'); }}>{p.archived ? 'Include in review' : 'Leave out of review'}</button>
          </div></>)}
          <button className="btn primary" onClick={() => setCompOpen(true)}>Add to composition</button>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 520px', minWidth: 0, position: 'sticky', top: 16 }}>
          <div style={{ background: '#000', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 240px)', minHeight: 360, padding: 16 }}>
            <img src={imgUrl(p.id, 'preview')} alt={p.title} style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, height: 54, marginTop: 12, overflow: 'hidden' }}>
            {mates.map((t) => (
              <Link key={t.id} to={`/photo/${t.id}`} aria-label={t.title} style={{ height: '100%', flex: 'none', aspectRatio: String(t.ar), borderRadius: 3, overflow: 'hidden', opacity: t.id === p.id ? 1 : 0.5, outline: t.id === p.id ? '1px solid #efede8' : 'none', outlineOffset: 2 }}>
                <img src={imgUrl(t.id, 'thumb')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </Link>
            ))}
          </div>
        </div>

        <aside style={{ width: 340, flex: 'none', maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <input className="serif inline" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== p.title && patch({ title })} style={{ fontSize: 40, lineHeight: 1 }} />
            <DateLine p={p} hemisphere={profile.data?.hemisphere ?? 'north'} onSave={(v) => patch({ dateEdit: v })} />
            {shoot && <Link to={`/shoots/${shoot.id}`} style={{ fontSize: 13, color: 'var(--text2)', display: 'block', marginTop: 6 }}>{shoot.name}{shoot.place ? ` · ${shoot.place}` : ''}</Link>}
            {p.missing && <div className="reason">The original file is missing from the library.</div>}
            {p.archived && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Left out of review. It still appears everywhere else.</div>}
            {p.parentId && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>A variant of <Link to={`/photo/${p.parentId}`} className="t2" style={{ textDecoration: 'underline' }}>another photo</Link>. <button className="t2" onClick={() => patch({ parentId: null })}>Unlink</button></div>}
          </div>

          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <div style={{ font: `400 44px/1 ${serif}` }}>{fmt(score)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>combined score{rankInShoot ? ` · #${rankInShoot} in its shoot` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 44, width: 110 }} aria-label="Ratings by session">
                {rs.map((r) => <i key={r.session} title={`${emoji(r.rating)} ${r.rating}`} style={{ flex: 1, background: 'rgba(239,237,232,.75)', borderRadius: 1, height: `${(r.rating / 5) * 100}%` }} />)}
              </div>
            </div>
            {[['You', avg === null ? 'Not rated yet' : `${fmt(avg)} · ${rs.length} of ${settings?.sessions ?? 4} sessions`], ['Guests', g?.avg != null ? `${fmt(g.avg)} · ${g.n} ${g.n === 1 ? 'person' : 'people'}` : 'None yet'], ['Next review', p.nextReviewAt ? day(p.nextReviewAt) : rs.length ? 'All sessions done' : '–']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderTop: '1px solid var(--hair)' }}><span style={{ color: 'var(--text2)' }}>{k}</span><span>{v}</span></div>
            ))}
            <button onClick={async () => { await patch({ reviewAgain: true }); refreshSummary(); nav('/review'); }} style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Rate it now</button>
            {p.xmpRating && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Rated {p.xmpRating}/5 in another app (not counted as a review).</div>}
          </div>

          {(comments.data?.comments ?? []).length > 0 && (
            <div>
              <div style={eyebrow}>Guest comments</div>
              {comments.data!.comments.map((c) => <div key={c.id} style={{ marginBottom: 8, fontSize: 13 }}><span style={{ color: 'var(--text2)' }}>{c.by}</span> · {c.body}</div>)}
            </div>
          )}
          <div>
            <div style={eyebrow}>Compositions</div>
            <button onClick={() => setCompOpen(true)} style={{ width: '100%', borderRadius: 999, padding: '11px 20px', fontSize: 14, boxShadow: ring, color: 'var(--text)' }}>
              {inCount ? `In ${inCount} ${inCount === 1 ? 'composition' : 'compositions'} · manage` : 'Add to composition'}
            </button>
          </div>
          {mapOpen && <MapPin lat={p.lat} lon={p.lon} onClose={() => setMapOpen(false)} onSave={async (la, lo) => { await patch({ lat: la, lon: lo }, la === null ? 'Pin removed.' : 'Pin saved.'); setMapOpen(false); }} />}
          {compOpen && <CompPicker ids={[p.id]} onClose={() => setCompOpen(false)} onDone={(m) => { setMsg(m); colls.reload(); }} />}

          <div>
            <div style={eyebrow}>Sensitive</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['nudity', 'violence', 'adult'] as const).map((n) => {
                const t = p.tags.find((x) => x.name === n);
                const on = !!t && t.accepted;
                return <button key={n} className="chip" aria-pressed={on} onClick={() => tagAct(n, 'tag', on ? 'remove' : 'add')} style={{ boxShadow: on ? 'inset 0 0 0 1px var(--text)' : t && t.source === 'ai' && !t.accepted ? 'inset 0 0 0 1px var(--warn)' : undefined, textTransform: 'capitalize' }}>{on ? '✓ ' : ''}{n}{t && t.source === 'ai' && !t.accepted ? ' · AI suggests' : ''}</button>;
              })}
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Tagged photos are never shown in Community review.</div>
          </div>
          <div>
            <div style={eyebrow}>Prints at 300 PPI</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {fits.map((f) => (
                <div key={f.size} style={{ background: 'var(--surface)', borderRadius: 8, padding: 10, textAlign: 'center', boxShadow: f.ok ? 'none' : 'inset 0 0 0 1px rgba(231,140,120,.5)' }}>
                  <div style={{ font: `400 20px ${serif}` }}>{f.size}</div>
                  <div style={{ fontSize: 11.5, color: f.ok ? 'var(--text2)' : 'oklch(0.78 0.11 35)', marginTop: 2 }}>{f.note}</div>
                </div>
              ))}
            </div>
            <div style={{ font: `400 11.5px ${mono}`, color: 'var(--muted)', marginTop: 8 }}>{p.w} × {p.h} px · {p.fileType}</div>
          </div>

          <div>
            <div style={eyebrow}>Subjects & tags</div>
            <TagGroup p={p} kind="subject" mine={tagsOf('subject')} suggested={suggested.filter((t) => t.kind === 'subject')} tagAct={tagAct} />
            <TagGroup p={p} kind="tag" mine={tagsOf('tag')} suggested={suggested.filter((t) => t.kind === 'tag')} tagAct={tagAct} />
          </div>

          <dl style={{ font: `400 11.5px/1.9 ${mono}`, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '80px 1fr', margin: 0 }}>
            <dt style={{ color: 'var(--faint)' }}>Captured</dt><dd style={{ margin: 0 }}>{p.capturedAt ? fmtDate(p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }) : '–'}</dd>
            <dt style={{ color: 'var(--faint)' }}>Place</dt>
            <dd style={{ margin: 0 }}><input value={place} onChange={(e) => setPlace(e.target.value)} onBlur={() => place !== p.place && patch({ place })} placeholder="Name this place" aria-label="Place" list="known-places" style={{ font: 'inherit', width: '100%', background: 'none', border: 0, outline: 'none', color: 'inherit', padding: 0 }} /><datalist id="known-places">{(places.data ?? []).map((x) => <option key={x.name} value={x.name} />)}</datalist>{p.lat !== null && p.lon !== null && <span style={{ color: 'var(--faint)' }}>{fmtCoord(p.lat, p.lon)} </span>}<button className="t2" onClick={() => setMapOpen(true)} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{p.lat !== null ? 'Move pin' : 'Pin on map'}</button></dd>
            <GearRows p={p} patch={(body) => patch(body)} />
            <dt style={{ color: 'var(--faint)' }}>File</dt><dd style={{ margin: 0 }}>{p.file} · {p.sizeMb} MB</dd>
          </dl>

          <div>
            <div style={eyebrow}>Description</div>
            <textarea aria-label="Description" className="area" rows={3} value={desc} placeholder="Add a description" onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== p.description && patch({ description: desc })} />
            {showAiDescription && (
              <div className="aibox">
                <div className="label" style={{ marginBottom: 6 }}>AI description</div>
                <p style={{ margin: '0 0 8px' }}>{sug!.description}</p>
                <button className="pill" onClick={() => patch({ acceptAiDescription: true }, 'Description saved.').then(refreshSummary)}>Use this</button>{' '}
                <button className="pill" onClick={() => patch({ rejectAiDescription: true }).then(refreshSummary)}>Reject</button>
              </div>
            )}
            {ai && sug && (sug.composition || sug.lighting || sug.mood) && (
              <dl className="exif" style={{ margin: '10px 0 0' }}>
                {sug.composition && <><dt>composition</dt><dd>{sug.composition}</dd></>}
                {sug.lighting && <><dt>light</dt><dd>{sug.lighting}</dd></>}
                {sug.mood && <><dt>mood</dt><dd>{sug.mood}</dd></>}
              </dl>
            )}
            {ai && <button className="t2" style={{ fontSize: 12, marginTop: 8 }} onClick={() => patch({ reanalyse: true }, 'Queued for AI analysis.')}>{p.aiStatus === 'done' ? 'Analyse again' : p.aiStatus === 'error' ? 'Analysis failed. Try again' : 'Analyse now'}</button>}
          </div>

          {p.palette.length > 0 && (
            <div>
              <div style={eyebrow}>Colour and light</div>
              <Swatches palette={p.palette} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {[...new Set(p.palette.map((s) => s.name))].slice(0, 3).join(', ')} · {p.brightness !== null && (p.brightness < 0.35 ? 'dark' : p.brightness > 0.65 ? 'bright' : 'mid-tone')} · {p.contrast !== null && (p.contrast < 0.15 ? 'low contrast' : p.contrast > 0.28 ? 'high contrast' : 'medium contrast')}
              </div>
            </div>
          )}

          {(p.variants.length > 0 || !p.parentId) && (
            <div>
              <div style={eyebrow}>Variants</div>
              <div className="variants">
                <figure><Img p={p} style={{ height: 40, width: 'auto' }} />This one</figure>
                {p.variants.map((v) => <Link key={v} to={`/photo/${v}`}><Img p={{ id: v, ar: 1.5 }} style={{ height: 40, width: 'auto' }} /></Link>)}
              </div>
              {p.variants.length === 0 && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Edits and crops of this photo appear here once linked. <Link to="/duplicates" className="t2" style={{ textDecoration: 'underline' }}>Review near-duplicates</Link></div>}
            </div>
          )}

          {p.conflicts.length > 0 && (
            <div className="aibox">
              <div className="label" style={{ marginBottom: 6 }}>Another app changed this</div>
              {p.conflicts.map((c) => (
                <div key={c.field} style={{ marginBottom: 8, fontSize: 13 }}>
                  <b>{c.field}</b>: yours “{c.mine}”, theirs “{c.theirs}”<br />
                  <button className="pill" onClick={async () => { await api('/metadata/resolve', { body: { photoId: p.id, field: c.field, use: 'mine' } }); photo.reload(); }}>Keep mine</button>{' '}
                  <button className="pill" onClick={async () => { await api('/metadata/resolve', { body: { photoId: p.id, field: c.field, use: 'theirs' } }); photo.reload(); }}>Use theirs</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px 18px', fontSize: 12.5, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <a href={`/api/photos/${p.id}/original`} download>Download original</a>
            <a href={`/api/photos/${p.id}/xmp`} download>Export XMP</a>
            <button onClick={async () => { await patch({ reviewAgain: true }, 'Queued for review.'); refreshSummary(); }}>Review again</button>
            <button onClick={() => patch({ archived: !p.archived }, p.archived ? 'Back in review.' : 'Left out of review. It still shows everywhere else.')}>{p.archived ? 'Include in review' : 'Leave out of review'}</button>
            <button onClick={async () => {
              if (!window.confirm(`Take “${p.title}” out of Frames?\n\nIts reviews, tags and composition places go with it. The file in your library folder is not touched (a copy Frames holds itself, such as an upload, is deleted). A scan will not bring it back.`)) return;
              await api(`/photos/${p.id}`, { method: 'DELETE' });
              refreshSummary();
              nav(-1);
            }}>Delete from Frames</button>
          </div>
          <label className="form" style={{ fontSize: 13 }}>
            <span className="t2">Photoshoot</span>
            <select aria-label="Photoshoot" value={p.shootId} onChange={(e) => patch({ shootId: Number(e.target.value) }, 'Moved.')}>
              {(shoots.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {msg && <div className="muted" role="status" style={{ fontSize: 12.5 }}>{msg}</div>}
        </aside>
      </div>
    </div>
  );
}

type Tag = PhotoFull['tags'][number];

/** Subjects or tags as pills: the accepted ones, the AI's suggestions to accept or reject, and a "+ Add" box. A top-level component, so typing never loses focus. */
function TagGroup({ p, kind, mine, suggested, tagAct }: { p: PhotoFull; kind: 'tag' | 'subject'; mine: Tag[]; suggested: Tag[]; tagAct: (name: string, kind: string, action: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }} data-photo={p.id}>
      {mine.map((t) => <span key={t.name} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, background: 'var(--hair)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Link to={`/library?${kind}=${encodeURIComponent(t.name)}`}>{t.name}</Link><button aria-label={`Remove ${t.name}`} onClick={() => tagAct(t.name, kind, 'remove')} style={{ color: 'var(--muted)' }}>✕</button></span>)}
      {suggested.map((t) => (
        <span key={t.name} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.35)', borderStyle: 'dashed', display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--text2)' }} title="Suggested by the AI">{t.name}
          <button aria-label={`Accept ${t.name}`} onClick={() => tagAct(t.name, kind, 'add')} style={{ color: 'var(--text)' }}>✓</button>
          <button aria-label={`Reject ${t.name}`} onClick={() => tagAct(t.name, kind, 'reject')}>✕</button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void tagAct(text, kind, 'add'); setText(''); } setAdding(false); }}>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setAdding(false)} placeholder={`Add a ${kind}`} aria-label={`Add a ${kind}`} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, width: 130 }} />
        </form>
      ) : <button onClick={() => setAdding(true)} aria-label={`Add a ${kind}`} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text2)' }}>+ {kind === 'subject' ? 'Subject' : 'Tag'}</button>}
    </div>
  );
}


/** The photograph's date, editable. Defaults to the camera date; with none, the upload date. Shows its source, and the season for the person's hemisphere. */
function DateLine({ p, hemisphere, onSave }: { p: PhotoFull; hemisphere: Hemisphere; onSave: (v: string | null) => void }) {
  const camera = p.capturedAt ? p.capturedAt.slice(0, 10) : '';
  const shown = p.dateEdit ?? (camera || p.addedAt.slice(0, 10));
  const source = p.dateEdit ? 'Date edited by you' : camera ? 'Date taken, from camera data' : 'No camera date · using the upload date';
  const month = Number(shown.slice(5, 7));
  const season = hemisphere !== 'none' && month ? seasonOf(month, hemisphere) : '';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="date" aria-label="Photo date" className="field-in" style={{ height: 34, width: 'auto', padding: '0 10px', fontSize: 13 }} value={shown} onChange={(e) => e.target.value && onSave(e.target.value)} />
        {season && <span className="chip" title="From the date and your hemisphere (Settings, Profile)">{season}</span>}
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{source}{p.dateEdit && <> · <button style={{ textDecoration: 'underline' }} onClick={() => onSave(null)}>Reset</button></>}</div>
    </div>
  );
}
