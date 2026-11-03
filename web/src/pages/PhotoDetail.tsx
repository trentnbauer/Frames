import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS, fmtCoord, fmtDate, type Collection, type PhotoFull, type PhotoLite, type Shoot } from '../data';
import { Fit, Header, Img, Loading, Swatches, useField, useKey } from '../components/bits';
import { useStore } from '../store';

export function PhotoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const photo = useApi<PhotoFull>(`/photos/${id}`);
  const shoots = useApi<Shoot[]>('/shoots');
  const all = useApi<{ photos: PhotoLite[] }>('/photos');
  const colls = useApi<Collection[]>('/collections');
  const similar = useApi<PhotoLite[]>(`/photos/${id}/similar?limit=8`);
  const inPf = useApi<{ inPortfolio: boolean }>(`/portfolio/photos/${id}`);
  const [picker, setPicker] = useState(false);
  const [msg, setMsg] = useState('');
  const p = photo.data;
  // Each field follows the server only when its own value changes, so a refresh never wipes text being typed elsewhere.
  const [title, setTitle] = useField(p?.title ?? '', p?.id);
  const [desc, setDesc] = useField(p?.description ?? '', p?.id);
  const [place, setPlace] = useField(p?.place ?? '', p?.id);
  useEffect(() => setMsg(''), [p?.id]);

  const list = all.data?.photos ?? [];
  const idx = list.findIndex((x) => x.id === Number(id));
  const go = (d: number) => list.length && nav(`/photo/${list[(idx + d + list.length) % list.length].id}`);
  useKey((e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); }, [idx, list.length]);

  if (!p) return <div className="page"><Header /><Loading error={photo.error} /></div>;
  const ai = !!settings && settings.ai !== 'off';
  const shoot = shoots.data?.find((s) => s.id === p.shootId);
  const rs = p.reviews;
  const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0;
  const trend = rs.length > 1 ? rs[rs.length - 1].rating - rs[0].rating : 0;
  const lastNote = [...rs].reverse().find((r) => r.note)?.note;
  const emoji = (n: number) => RATINGS[n - 1].emoji;
  const patch = async (body: Record<string, unknown>, ok?: string) => { await api(`/photos/${p.id}`, { method: 'PATCH', body }); photo.reload(); if (ok) setMsg(ok); };
  const tagAct = async (name: string, kind: string, action: string) => { await api(`/photos/${p.id}/tags`, { method: 'PUT', body: { name, kind, action } }); photo.reload(); };

  const sug = p.aiSuggestion;
  const showAiDescription = ai && sug && sug.description && p.descSource !== 'user';

  return (
    <div className="page">
      <Header />
      <div className="detail">
        <div className="main">
          <div className="spread" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <Link to={shoot ? `/shoots/${shoot.id}` : '/library'} className="t2">← {shoot?.name ?? 'Library'}</Link>
            <span style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
              <Link to={`/library?similarTo=${p.id}`} className="t2">Find similar</Link>
              {similar.data?.[0] && <Link to={`/compare?a=${p.id}&b=${similar.data[0].id}`} className="t2">Compare</Link>}
              {idx >= 0 && <span>{idx + 1} of {list.length}</span>}
              <button aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
              <button aria-label="Next photo" onClick={() => go(1)}>›</button>
            </span>
          </div>
          <div className="stage"><div><Fit p={p} /></div></div>
          {similar.data && similar.data.length > 0 && (
            <div className="strip" style={{ height: 84 }}>
              {similar.data.map((s) => <Link key={s.id} to={`/photo/${s.id}`} title={`${Math.round((s.similarity ?? 0) * 100)}% similar`} aria-label={`Similar: ${s.title}`} style={{ aspectRatio: String(s.ar) }}><Img p={s} style={{ height: '100%', width: 'auto' }} /></Link>)}
            </div>
          )}
        </div>
        <aside className="side">
          <div>
            <input className="serif inline" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== p.title && patch({ title })} style={{ fontSize: 28 }} />
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{[shoot?.name, fmtDate(p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }), p.file].filter(Boolean).join(' · ')}</div>
            {p.missing && <div className="reason">The original file is missing from the library.</div>}
            {p.archived && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Left out of review. It still appears everywhere else.</div>}
            {p.parentId && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>A variant of <Link to={`/photo/${p.parentId}`} className="t2" style={{ textDecoration: 'underline' }}>another photo</Link>. <button className="t2" onClick={() => patch({ parentId: null })}>Unlink</button></div>}
          </div>

          <div>
            {rs.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Not reviewed yet.</div> : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="serif" style={{ fontSize: 52, lineHeight: 1 }}>{avg.toFixed(1)}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>average of {rs.length} {rs.length === 1 ? 'review' : 'reviews'}</span>
                </div>
                <div className="spark" style={{ margin: '12px 0 6px' }} aria-label="Ratings by session">{rs.map((r) => <i key={r.session} title={`${emoji(r.rating)} ${r.rating}`} style={{ height: `${(r.rating / 5) * 100}%` }} />)}</div>
                {rs.length > 1 && <div className="muted" style={{ fontSize: 12.5 }}>{trend > 0 ? 'Improving ↗' : trend < 0 ? 'Declining ↘' : 'Steady →'}</div>}
              </>
            )}
            {p.xmpRating && <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Rated {p.xmpRating}/5 in another app (not counted as a review).</div>}
          </div>
          {rs.length > 0 && (
            <div>
              {rs.slice().reverse().map((r) => <div className="row" key={r.session}><span className="t2">Session {r.session} · {fmtDate(r.date)}</span><span>{emoji(r.rating)}</span></div>)}
              {lastNote && <p className="serif" style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--muted)', margin: '10px 0 0' }}>{lastNote}</p>}
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Description</div>
            <textarea aria-label="Description" className="area" rows={3} value={desc} placeholder="Add a description" onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== p.description && patch({ description: desc })} />
            {showAiDescription && (
              <div className="aibox">
                <div className="label" style={{ marginBottom: 6 }}>AI description</div>
                <p style={{ margin: '0 0 8px' }}>{sug!.description}</p>
                <button className="pill" onClick={() => patch({ acceptAiDescription: true }, 'Description saved.')}>Use this</button>{' '}
                <button className="pill" onClick={() => patch({ rejectAiDescription: true })}>Reject</button>
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

          <TagGroup p={p} ai={ai} kind="subject" label="Subjects" tagAct={tagAct} />
          <TagGroup p={p} ai={ai} kind="tag" label="Tags" tagAct={tagAct} />

          {p.palette.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Colour and light</div>
              <Swatches palette={p.palette} />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {[...new Set(p.palette.map((s) => s.name))].slice(0, 3).join(', ')} · {p.brightness !== null && (p.brightness < 0.35 ? 'dark' : p.brightness > 0.65 ? 'bright' : 'mid-tone')} · {p.contrast !== null && (p.contrast < 0.15 ? 'low contrast' : p.contrast > 0.28 ? 'high contrast' : 'medium contrast')}
              </div>
            </div>
          )}

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Variants</div>
            <div className="variants">
              <figure><Img p={p} style={{ height: 40, width: 'auto' }} />This one</figure>
              {p.variants.map((v) => <Link key={v} to={`/photo/${v}`}><Img p={{ id: v, ar: 1.5 }} style={{ height: 40, width: 'auto' }} /></Link>)}
            </div>
            {p.variants.length === 0 && !p.parentId && <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Edits and crops of this photo appear here once linked. <Link to="/duplicates" className="t2" style={{ textDecoration: 'underline' }}>Review near-duplicates</Link></div>}
          </div>

          <div>
            <div className="label" style={{ marginBottom: 8 }}>Location</div>
            {p.lat !== null && p.lon !== null && <div className="mono" style={{ fontSize: 12, marginBottom: 6 }}>{fmtCoord(p.lat, p.lon)}</div>}
            <form className="form" onSubmit={(e) => { e.preventDefault(); patch({ place }); }}>
              <input value={place} onChange={(e) => setPlace(e.target.value)} onBlur={() => place !== p.place && patch({ place })} placeholder="Name this place" aria-label="Place" />
            </form>
          </div>

          <dl className="exif" style={{ margin: 0 }}>
            <dt>camera</dt><dd>{p.camera || '–'}</dd>
            <dt>lens</dt><dd>{p.lens || '–'}</dd>
            <dt>exposure</dt><dd>{p.exposure || '–'}</dd>
            <dt>pixels</dt><dd>{p.w ? `${p.w} × ${p.h}` : '–'}</dd>
            <dt>file</dt><dd>{p.fileType} · {p.sizeMb} MB</dd>
          </dl>

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

          <div style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => setPicker(!picker)}>Add to collection</button>
            <button className="pill" aria-pressed={!!inPf.data?.inPortfolio} onClick={async () => { await api(`/portfolio/photos/${p.id}`, { body: { on: !inPf.data?.inPortfolio } }); inPf.reload(); setMsg(inPf.data?.inPortfolio ? 'Taken out of the portfolio.' : 'Added to the portfolio collection.'); }}>{inPf.data?.inPortfolio ? 'In portfolio ✓' : 'Add to portfolio'}</button>
            <button className="pill" onClick={async () => { await patch({ reviewAgain: true }, 'Queued for review.'); refreshSummary(); }}>Review again</button>
            <button className="pill" onClick={() => patch({ archived: !p.archived }, p.archived ? 'Back in review.' : 'Left out of review. It still shows everywhere else.')}>{p.archived ? 'Include in review' : 'Leave out of review'}</button>
            <a className="pill" href={`/api/photos/${p.id}/xmp`} download>Export XMP</a>
            {picker && (
              <div className="menu" style={{ top: -8, transform: 'translateY(-100%)' }}>
                {(colls.data ?? []).length === 0 && <span className="faint menu-note">No collections yet</span>}
                {(colls.data ?? []).map((c) => <button key={c.id} onClick={async () => { await api(`/collections/${c.id}/photos/${p.id}`, { method: 'PUT' }); setPicker(false); setMsg(`Added to ${c.name}.`); }}>{c.name}</button>)}
              </div>
            )}
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

/** Subjects or tags: the accepted ones, the AI's suggestions to accept or reject, and a box to add one. A top-level component, so typing never loses focus. */
function TagGroup({ p, ai, kind, label, tagAct }: { p: PhotoFull; ai: boolean; kind: 'tag' | 'subject'; label: string; tagAct: (name: string, kind: string, action: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const mine = p.tags.filter((t) => t.kind === kind && t.accepted);
  const suggested = ai ? p.tags.filter((t) => t.kind === kind && !t.accepted && t.source === 'ai') : [];
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>{label}{suggested.length > 0 && ' · AI suggested'}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {mine.map((t) => <span key={t.name} className="chip"><Link to={`/library?${kind}=${encodeURIComponent(t.name)}`}>{t.name}</Link><button aria-label={`Remove ${t.name}`} onClick={() => tagAct(t.name, kind, 'remove')}>✕</button></span>)}
        {suggested.map((t) => (
          <span key={t.name} className="chip sug">{t.name}
            <button aria-label={`Accept ${t.name}`} onClick={() => tagAct(t.name, kind, 'add')}>✓</button>
            <button aria-label={`Reject ${t.name}`} onClick={() => tagAct(t.name, kind, 'reject')}>✕</button>
          </span>
        ))}
      </div>
      <form className="form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (text.trim()) { void tagAct(text, kind, 'add'); setText(''); } }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Add a ${kind}`} aria-label={`Add a ${kind}`} />
      </form>
    </div>
  );
}
