import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';

type Rec = { growing: (PhotoLite & { from: number; to: number })[]; quiet: PhotoLite[]; forgotten: PhotoLite[]; archive: PhotoLite[] };

export function ForYou() {
  const recs = useApi<Rec>('/recommendations');
  const d = recs.data;
  const dismiss = async (kind: string, items: PhotoLite[]) => {
    await api('/recommendations/dismiss', { body: { kind, photoIds: items.map((p) => p.id) } });
    recs.reload();
  };

  const Block = ({ kind, h, why, items, badge }: { kind: string; h: string; why: string; items: (PhotoLite & { from?: number; to?: number })[]; badge?: boolean }) =>
    items.length === 0 ? null : (
      <section className="fy">
        <div className="spread"><h2>{h}</h2><span className="muted" style={{ fontSize: 12 }}>{why}</span></div>
        <div className="strip">
          {items.map((p) => (
            <Link key={p.id} to={`/photo/${p.id}`} className="tile" style={{ aspectRatio: String(p.ar) }} aria-label={p.title}>
              <Img p={p} style={{ height: '100%', width: 'auto' }} />
              {badge && p.from !== undefined && <em>{p.from}.0 → {p.to}.0</em>}
            </Link>
          ))}
        </div>
        <div className="acts"><button className="pill" onClick={() => dismiss(kind, items)}>Not for me</button></div>
      </section>
    );

  const none = d && !d.growing.length && !d.quiet.length && !d.archive.length;
  return (
    <div className="page">
      <Header />
      <Title>For you</Title>
      {(recs.loading || recs.error) && <Loading error={recs.error} />}
      {d && (
        <>
          <Block kind="growing" h="Growing on you" why="Ratings rising across sessions" items={d.growing} badge />
          <Block kind="quiet" h="Quietly excellent" why="Rated highly every time, in no collection" items={d.quiet} />
          <Block kind="archive" h="Consider archiving" why="Averaging under 2 after four sessions" items={d.archive} />
          {none && <div className="empty">Nothing to suggest yet. Recommendations appear as photographs build up a review history.</div>}
          <p className="faint" style={{ fontSize: 12.5, maxWidth: 520 }}>Matching moods across shoots and “more like this” need image analysis, which isn’t available yet.</p>
        </>
      )}
    </div>
  );
}
