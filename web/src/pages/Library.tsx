import { useMemo, useState } from 'react';
import { PHOTOS, SHOOTS, avg } from '../data';
import { Header, Justified, Title } from '../components/bits';

type Filter = 'Photoshoot' | 'Subject' | 'Tag' | 'Rating';
const SUBJECTS = ['fog', 'water', 'birds', 'dusk', 'architecture', 'coast', 'long exposure', 'minimal'];

export function Library() {
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState<{ kind: Filter; value: string } | null>(null);
  const [newest, setNewest] = useState(true);

  const options: Record<Filter, string[]> = {
    Photoshoot: SHOOTS.map((s) => s.name),
    Subject: SUBJECTS.slice(0, 4),
    Tag: SUBJECTS.slice(4),
    Rating: ['4+ average', '3+ average', 'Under 3'],
  };

  const groups = useMemo(() => {
    const list = PHOTOS.filter((p) => {
      if (!f) return true;
      if (f.kind === 'Photoshoot') return SHOOTS.find((s) => s.id === p.shootId)?.name === f.value;
      if (f.kind === 'Rating') {
        const a = avg(p.reviews);
        return f.value === '4+ average' ? a >= 4 : f.value === '3+ average' ? a >= 3 : a < 3;
      }
      return p.tags.some((t) => t.accepted && t.name === f.value);
    });
    const order = newest ? SHOOTS : [...SHOOTS].reverse();
    return order.map((s) => ({ s, photos: list.filter((p) => p.shootId === s.id) })).filter((g) => g.photos.length);
  }, [f, newest]);
  const total = groups.reduce((n, g) => n + g.photos.length, 0);

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <Title count={`${total === PHOTOS.length ? '2,418' : total} photographs`}>Library</Title>
        <div className="filters" style={{ marginBottom: 28 }}>
          <button className={!f ? 'on' : ''} onClick={() => { setF(null); setOpen(null); }}>All</button>
          {(Object.keys(options) as Filter[]).map((k) => (
            <span key={k} style={{ position: 'relative' }}>
              <button className={f?.kind === k ? 'on' : ''} aria-haspopup="menu" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                {f?.kind === k ? `${k}: ${f.value}` : k}
              </button>
              {open === k && (
                <div className="menu" role="menu">
                  {options[k].map((o) => (
                    <button key={o} role="menuitem" className={f?.value === o ? 'on' : ''} onClick={() => { setF({ kind: k, value: o }); setOpen(null); }}>{o}</button>
                  ))}
                </div>
              )}
            </span>
          ))}
          <span className="faint">Date · Colour · Location</span>
          <span className="sep" />
          <button onClick={() => setNewest(!newest)}>{newest ? 'Newest first' : 'Oldest first'}</button>
        </div>
      </div>
      {groups.length === 0 && <div className="empty">No photographs match this filter.</div>}
      {groups.map(({ s, photos }) => (
        <section className="group" key={s.id}>
          <h2>{s.name}</h2>
          <div className="meta">{s.place} · {s.dates} · {photos.length}</div>
          <Justified photos={photos} />
        </section>
      ))}
    </div>
  );
}
