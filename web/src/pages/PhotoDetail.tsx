import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS, fmtDate, type Collection, type PhotoFull, type PhotoLite, type Shoot, type Tag } from '../data';
import { Fit, Header, Loading, useKey } from '../components/bits';
import { useStore } from '../store';

export function PhotoDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings, refreshSummary } = useStore();
  const photo = useApi<PhotoFull>(`/photos/${id}`);
  const shoots = useApi<Shoot[]>('/shoots');
  const all = useApi<{ photos: PhotoLite[] }>('/photos');
  const colls = useApi<Collection[]>('/collections');
  const [picker, setPicker] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [msg, setMsg] = useState('');

  const list = all.data?.photos ?? [];
  const idx = list.findIndex((p) => p.id === Number(id));
  const go = (d: number) => list.length && nav(`/photo/${list[(idx + d + list.length) % list.length].id}`);
  useKey((e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  }, [idx, list.length]);

  const p = photo.data;
  if (!p) return <div className="page"><Header /><Loading error={photo.error} /></div>;
  const ai = !!settings && settings.ai !== 'off';
  const shoot = shoots.data?.find((s) => s.id === p.shootId);
  const rs = p.reviews;
  const avg = rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0;
  const trend = rs.length > 1 ? rs[rs.length - 1].rating - rs[0].rating : 0;
  const lastNote = [...rs].reverse().find((r) => r.note)?.note;
  const emoji = (n: number) => RATINGS[n - 1].emoji;

  const editTag = async (t: Partial<Tag> & { name: string; remove?: boolean }) => {
    await api(`/photos/${p.id}/tags`, { method: 'PUT', body: t });
    photo.reload();
  };
  const accepted = p.tags.filter((t) => t.accepted);
  const suggested = ai ? p.tags.filter((t) => !t.accepted && t.source === 'ai') : [];
  const addTo = async (c: Collection) => {
    await api(`/collections/${c.id}/photos/${p.id}`, { method: 'PUT' });
    setPicker(false);
    setMsg(`Added to ${c.name}.`);
  };

  return (
    <div className="page">
      <Header />
      <div className="detail">
        <div className="main">
          <div className="spread" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <Link to="/library" className="t2">← {shoot?.name ?? 'Library'}</Link>
            <span style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
              {idx >= 0 && <span>{idx + 1} of {list.length}</span>}
              <button aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
              <button aria-label="Next photo" onClick={() => go(1)}>›</button>
            </span>
          </div>
          <div className="stage"><div><Fit p={p} /></div></div>
        </div>
        <aside className="side">
          <div>
            <h1 className="serif" style={{ fontSize: 28 }}>{p.title}</h1>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{[shoot?.name, fmtDate(p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }), p.file].filter(Boolean).join(' · ')}</div>
            {p.missing && <div className="reason">The original file is missing from the library.</div>}
          </div>
          <div>
            {rs.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>Not reviewed yet.</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="serif" style={{ fontSize: 52, lineHeight: 1 }}>{avg.toFixed(1)}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>average of {rs.length} {rs.length === 1 ? 'review' : 'reviews'}</span>
                </div>
                <div className="spark" style={{ margin: '12px 0 6px' }} aria-label="Ratings by session">
                  {rs.map((r) => <i key={r.session} title={`${emoji(r.rating)} ${r.rating}`} style={{ height: `${(r.rating / 5) * 100}%` }} />)}
                </div>
                {rs.length > 1 && <div className="muted" style={{ fontSize: 12.5 }}>{trend > 0 ? 'Improving ↗' : trend < 0 ? 'Declining ↘' : 'Steady →'}</div>}
              </>
            )}
          </div>
          {rs.length > 0 && (
            <div>
              {rs.slice().reverse().map((r) => (
                <div className="row" key={r.session}>
                  <span className="t2">Session {r.session} · {fmtDate(r.date)}</span>
                  <span>{emoji(r.rating)}</span>
                </div>
              ))}
              {lastNote && <p className="serif" style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--muted)', margin: '10px 0 0' }}>{lastNote}</p>}
            </div>
          )}
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Subjects &amp; tags{suggested.length > 0 && ' · AI suggested'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {accepted.map((t) => (
                <span key={t.name} className="chip">{t.name}<button aria-label={`Remove ${t.name}`} onClick={() => editTag({ name: t.name, remove: true })}>✕</button></span>
              ))}
              {suggested.map((t) => (
                <span key={t.name} className="chip sug">
                  {t.name}
                  <button aria-label={`Accept ${t.name}`} onClick={() => editTag({ name: t.name })}>✓</button>
                  <button aria-label={`Reject ${t.name}`} onClick={() => editTag({ name: t.name, remove: true })}>✕</button>
                </span>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) { editTag({ name: newTag }); setNewTag(''); } }} style={{ marginTop: 10 }} className="form">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Add a tag" aria-label="Add a tag" />
            </form>
          </div>
          <dl className="exif" style={{ margin: 0 }}>
            <dt>camera</dt><dd>{p.camera || '–'}</dd>
            <dt>lens</dt><dd>{p.lens || '–'}</dd>
            <dt>exposure</dt><dd>{p.exposure || '–'}</dd>
            <dt>pixels</dt><dd>{p.w ? `${p.w} × ${p.h}` : '–'}</dd>
            <dt>file</dt><dd>{p.fileType} · {p.sizeMb} MB</dd>
          </dl>
          <div style={{ position: 'relative', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => setPicker(!picker)}>Add to collection</button>
            <button className="pill" onClick={async () => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { reviewAgain: true } }); photo.reload(); refreshSummary(); setMsg('Queued for review.'); }}>Review again</button>
            <button className="pill" onClick={async () => { await api(`/photos/${p.id}`, { method: 'PATCH', body: { archived: !p.archived } }); photo.reload(); setMsg(p.archived ? 'Restored to the library.' : 'Archived. It still shows in search and collections.'); }}>{p.archived ? 'Unarchive' : 'Archive'}</button>
            {picker && (
              <div className="menu" style={{ top: -8, transform: 'translateY(-100%)' }}>
                {(colls.data ?? []).length === 0 && <span className="faint" style={{ padding: '7px 10px', fontSize: 13 }}>No collections yet</span>}
                {(colls.data ?? []).map((c) => <button key={c.id} onClick={() => addTo(c)}>{c.name}</button>)}
              </div>
            )}
          </div>
          {msg && <div className="muted" role="status" style={{ fontSize: 12.5 }}>{msg}</div>}
        </aside>
      </div>
    </div>
  );
}
