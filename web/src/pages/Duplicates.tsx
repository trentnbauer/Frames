import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';

type Group = { suggestedParentId: number; photos: PhotoLite[] };

/** Photographs that look almost the same. Nothing is deleted: you link edits and crops as variants, or say they are different. */
export function Duplicates() {
  const d = useApi<Group[]>('/duplicates');
  const act = async (path: string, body: unknown) => { await api(path, { body }); d.reload(); };
  return (
    <div className="page">
      <Header />
      <Title count={d.data ? `${d.data.length} ${d.data.length === 1 ? 'group' : 'groups'}` : undefined}>Near-duplicates</Title>
      <p className="t2" style={{ maxWidth: 560, marginTop: -12, marginBottom: 28, fontSize: 13.5 }}>
        These look almost identical. If one is an edit or a crop of another, link it as a variant. Every photograph stays in your library either way. Exact copies are skipped when you sync.
      </p>
      {(d.loading || d.error) && <Loading error={d.error} />}
      {d.data?.length === 0 && <div className="empty">No near-duplicates found.</div>}
      {d.data?.map((g) => (
        <section className="group" key={g.photos.map((p) => p.id).join('-')}>
          <div className="dupes">
            {g.photos.map((p) => (
              <figure key={p.id} className={p.id === g.suggestedParentId ? 'orig' : ''}>
                <Link to={`/photo/${p.id}`}><Img p={p} style={{ width: '100%', height: 'auto' }} /></Link>
                <figcaption>{p.file}<br /><span className="faint">{p.w} × {p.h}{p.id === g.suggestedParentId ? ' · largest' : ''}</span></figcaption>
              </figure>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="pill primary" onClick={() => act('/duplicates/variants', { parentId: g.suggestedParentId, childIds: g.photos.filter((p) => p.id !== g.suggestedParentId).map((p) => p.id) })}>Link as variants of the largest</button>
            <button className="pill" onClick={() => act('/duplicates/ignore', { photoIds: g.photos.map((p) => p.id) })}>They are different</button>
          </div>
        </section>
      ))}
    </div>
  );
}
