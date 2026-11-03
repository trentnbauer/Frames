import { useMemo, useState } from 'react';
import { useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { Header, Justified, Loading, Title } from '../components/bits';

type Kind = 'Photoshoot' | 'Tag' | 'Rating';
const RATING_OPTS = ['4+', '3+', 'Under 3'];

export function Library() {
  const [open, setOpen] = useState<Kind | null>(null);
  const [f, setF] = useState<{ kind: Kind; value: string; label: string } | null>(null);
  const [newest, setNewest] = useState(true);

  const shoots = useApi<Shoot[]>('/shoots');
  const tags = useApi<{ name: string; n: number }[]>('/tags');
  const qs = new URLSearchParams({ order: newest ? 'newest' : 'oldest' });
  if (f?.kind === 'Photoshoot') qs.set('shoot', f.value);
  if (f?.kind === 'Tag') qs.set('tag', f.value);
  if (f?.kind === 'Rating') qs.set('rating', f.value);
  const list = useApi<{ total: number; photos: PhotoLite[] }>(`/photos?${qs}`);

  const groups = useMemo(() => {
    if (!list.data || !shoots.data) return [];
    const order = newest ? shoots.data : [...shoots.data].reverse();
    return order.map((s) => ({ s, photos: list.data!.photos.filter((p) => p.shootId === s.id) })).filter((g) => g.photos.length);
  }, [list.data, shoots.data, newest]);

  const options: Record<Kind, { value: string; label: string }[]> = {
    Photoshoot: (shoots.data ?? []).map((s) => ({ value: String(s.id), label: s.name })),
    Tag: (tags.data ?? []).map((t) => ({ value: t.name, label: t.name })),
    Rating: RATING_OPTS.map((r) => ({ value: r, label: r === 'Under 3' ? 'Under 3 average' : `${r} average` })),
  };
  const total = list.data?.photos.length ?? 0;

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <Title count={list.data ? `${total.toLocaleString()} ${total === 1 ? 'photograph' : 'photographs'}` : undefined}>Library</Title>
        <div className="filters" style={{ marginBottom: 28 }}>
          <button className={!f ? 'on' : ''} onClick={() => { setF(null); setOpen(null); }}>All</button>
          {(Object.keys(options) as Kind[]).map((k) => (
            <span key={k} style={{ position: 'relative' }}>
              <button className={f?.kind === k ? 'on' : ''} aria-haspopup="menu" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                {f?.kind === k ? `${k}: ${f.label}` : k}
              </button>
              {open === k && (
                <div className="menu" role="menu">
                  {options[k].length === 0 && <span className="faint" style={{ padding: '7px 10px', fontSize: 13 }}>None yet</span>}
                  {options[k].map((o) => (
                    <button key={o.value} role="menuitem" className={f?.value === o.value ? 'on' : ''} onClick={() => { setF({ kind: k, ...o }); setOpen(null); }}>{o.label}</button>
                  ))}
                </div>
              )}
            </span>
          ))}
          <span className="sep" />
          <button onClick={() => setNewest(!newest)}>{newest ? 'Newest first' : 'Oldest first'}</button>
        </div>
      </div>
      {(list.loading || list.error) && <Loading error={list.error} />}
      {list.data && groups.length === 0 && <div className="empty">{f ? 'No photographs match this filter.' : 'No photographs yet. Add some on the Photoshoots page.'}</div>}
      {groups.map(({ s, photos }) => (
        <section className="group" key={s.id}>
          <h2>{s.name}</h2>
          <div className="meta">{[s.place, s.dates === s.name ? '' : s.dates, photos.length].filter(Boolean).join(' · ')}</div>
          <Justified photos={photos} />
        </section>
      ))}
    </div>
  );
}
