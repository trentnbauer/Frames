import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { COLLECTIONS, PHOTOS, RATINGS, avg, shootById } from '../data';
import { Fit, Header, Img, useKey } from '../components/bits';
import { useStore } from '../store';

export function PhotoDetail() {
  const { id } = useParams();
  const idx = Math.max(0, PHOTOS.findIndex((p) => p.id === Number(id)));
  const p = PHOTOS[idx];
  const shoot = shootById(p.shootId);
  const nav = useNavigate();
  const { settings } = useStore();
  const ai = settings.ai !== 'off';
  const [tags, setTags] = useState(p.tags);
  const [picker, setPicker] = useState(false);
  const [prev, setPrev] = useState(p.id);
  if (prev !== p.id) { setPrev(p.id); setTags(p.tags); setPicker(false); }

  const go = (d: number) => nav(`/photo/${PHOTOS[(idx + d + PHOTOS.length) % PHOTOS.length].id}`);
  useKey((e) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  }, [idx]);

  const a = avg(p.reviews);
  const trend = p.reviews.length > 1 ? p.reviews[p.reviews.length - 1].rating - p.reviews[0].rating : 0;
  const lastNote = [...p.reviews].reverse().find((r) => r.note)?.note;
  const emoji = (n: number) => RATINGS[n - 1].emoji;
  const shownTags = ai ? tags : tags.filter((t) => t.source === 'user');
  const inSet = (t: string) => shownTags.filter((x) => (t === 'sug' ? !x.accepted && x.source === 'ai' : x.accepted));

  return (
    <div className="page">
      <Header />
      <div className="detail">
        <div className="main">
          <div className="spread" style={{ fontSize: 13, color: 'var(--muted)' }}>
            <Link to="/library" className="t2">← {shoot.name}</Link>
            <span style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
              <Link to="/collections" className="t2">Compare</Link>
              {ai && <span className="t2">Find similar</span>}
              <span>{idx + 1} of {PHOTOS.length}</span>
              <button aria-label="Previous photo" onClick={() => go(-1)}>‹</button>
              <button aria-label="Next photo" onClick={() => go(1)}>›</button>
            </span>
          </div>
          <div className="stage"><div><Fit p={p} /></div></div>
        </div>
        <aside className="side">
          <div>
            <h1 className="serif" style={{ fontSize: 28 }}>{p.title}</h1>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{shoot.name} · {p.capturedAt} · {p.file}</div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span className="serif" style={{ fontSize: 52, lineHeight: 1 }}>{a ? a.toFixed(1) : '–'}</span>
              <span className="muted" style={{ fontSize: 12.5 }}>average of {p.reviews.length} {p.reviews.length === 1 ? 'review' : 'reviews'}</span>
            </div>
            <div className="spark" style={{ margin: '12px 0 6px' }} aria-label="Ratings by session">
              {p.reviews.map((r) => <i key={r.session} title={`${emoji(r.rating)} ${r.rating}`} style={{ height: `${(r.rating / 5) * 100}%` }} />)}
            </div>
            <div className="muted" style={{ fontSize: 12.5 }}>{trend > 0 ? 'Improving ↗' : trend < 0 ? 'Declining ↘' : 'Steady →'}</div>
          </div>
          <div>
            {p.reviews.slice().reverse().map((r) => (
              <div className="row" key={r.session}>
                <span className="t2">Session {r.session} · {r.date}</span>
                <span>{emoji(r.rating)}</span>
              </div>
            ))}
            {lastNote && <p className="serif" style={{ fontStyle: 'italic', fontSize: 15, color: 'var(--muted)', margin: '10px 0 0' }}>{lastNote}</p>}
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Variants</div>
            <div className="variants">
              {['Original', 'Crop 4:5', 'Crop 1:1'].map((v, i) => (
                <figure key={v}><Img p={{ ar: [p.ar, 0.8, 1][i], hue: p.hue }} style={{ height: 40, width: 'auto' }} />{v}</figure>
              ))}
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Subjects &amp; tags{ai && ' · AI suggested'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {inSet('ok').map((t) => <span key={t.name} className="chip">{t.name}</span>)}
              {ai && inSet('sug').map((t) => (
                <span key={t.name} className="chip sug">
                  {t.name}
                  <button aria-label={`Accept ${t.name}`} onClick={() => setTags(tags.map((x) => (x === t ? { ...x, accepted: true } : x)))}>✓</button>
                  <button aria-label={`Reject ${t.name}`} onClick={() => setTags(tags.filter((x) => x !== t))}>✕</button>
                </span>
              ))}
            </div>
          </div>
          <dl className="exif" style={{ margin: 0 }}>
            <dt>camera</dt><dd>{p.camera}</dd>
            <dt>lens</dt><dd>{p.lens}</dd>
            <dt>exposure</dt><dd>{p.exposure}</dd>
            <dt>pixels</dt><dd>{p.w} × {p.h}</dd>
            <dt>file</dt><dd>{p.fileType} · {p.sizeMb} MB</dd>
            <dt>stored</dt><dd>/cloud/{shoot.name}/{p.file}</dd>
          </dl>
          <div style={{ position: 'relative' }}>
            <button className="pill" onClick={() => setPicker(!picker)}>Add to collection</button>
            {picker && (
              <div className="menu" style={{ top: -8, transform: 'translateY(-100%)' }}>
                {COLLECTIONS.map((c) => <Link key={c.id} to={`/collections/${c.id}`} className="menu-item" style={{ padding: '7px 10px', fontSize: 13 }}>{c.name}</Link>)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
