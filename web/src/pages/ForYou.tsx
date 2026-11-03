import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';

type P = PhotoLite & { from?: number; to?: number };
type Rec = {
  growing: P[]; quiet: P[]; forgotten: P[]; archive: P[];
  similar: { seed: P; photos: P[] }[];
  complementary: { seed: P; reason: string; photos: P[] }[];
  together: { name: string; reason: string; aiAssisted: boolean; photoIds: number[]; photos: P[] }[];
  aiAssisted: boolean;
};

export function ForYou() {
  const recs = useApi<Rec>('/recommendations');
  const nav = useNavigate();
  const d = recs.data;
  const feedback = async (kind: string, items: { id: number }[], verdict: 'accept' | 'reject') => {
    await api('/recommendations/feedback', { body: { kind, photoIds: items.map((p) => p.id), verdict } });
    if (verdict === 'reject') recs.reload();
  };
  const Strip = ({ items, badge }: { items: P[]; badge?: boolean }) => (
    <div className="strip">
      {items.map((p) => (
        <Link key={p.id} to={`/photo/${p.id}`} className="tile" style={{ aspectRatio: String(p.ar) }} aria-label={p.title}>
          <Img p={p} style={{ height: '100%', width: 'auto' }} />
          {badge && p.from !== undefined && <em>{p.from}.0 → {p.to}.0</em>}
          {!badge && p.similarity !== undefined && <em>{Math.round(p.similarity * 100)}%</em>}
        </Link>
      ))}
    </div>
  );
  const Block = ({ kind, h, why, items, badge, more }: { kind: string; h: string; why: string; items: P[]; badge?: boolean; more?: boolean }) =>
    items.length === 0 ? null : (
      <section className="fy">
        <div className="spread"><h2>{h}</h2><span className="muted" style={{ fontSize: 12 }}>{why}</span></div>
        <Strip items={items} badge={badge} />
        <div className="acts">
          {more && <button className="pill" onClick={() => feedback(kind, items, 'accept')}>More like this</button>}
          <button className="pill" onClick={() => feedback(kind, items, 'reject')}>Not for me</button>
        </div>
      </section>
    );

  const empty = d && !d.growing.length && !d.quiet.length && !d.archive.length && !d.forgotten.length && !d.similar.length && !d.complementary.length && !d.together.length;
  return (
    <div className="page">
      <Header />
      <Title>For you</Title>
      {(recs.loading || recs.error) && <Loading error={recs.error} />}
      {d && (
        <>
          <Block kind="growing" h="Growing on you" why="Ratings rising across sessions" items={d.growing} badge />
          <Block kind="forgotten" h="Worth another look" why="Loved before, not seen for a while" items={d.forgotten} more />
          <Block kind="quiet" h="Quietly excellent" why="Rated highly every time, in no collection" items={d.quiet} more />
          {d.together.map((s) => (
            <section className="fy" key={s.photoIds.join('-')}>
              <div className="spread"><h2>Belongs together: {s.name}</h2><span className="muted" style={{ fontSize: 12 }}>{s.reason}{s.aiAssisted && ' · AI-assisted'}</span></div>
              <Strip items={s.photos} />
              <div className="acts">
                <button className="pill primary" onClick={async () => { const c = await api<Collection>('/collections', { body: { name: s.name, photoIds: s.photoIds } }); await feedback('together', s.photoIds.map((id) => ({ id })), 'accept'); nav(`/collections/${c.id}`); }}>Start a collection</button>
                <button className="pill" onClick={() => feedback('together', s.photoIds.map((id) => ({ id })), 'reject')}>Not for me</button>
              </div>
            </section>
          ))}
          {d.similar.map((b) => <Block key={`s${b.seed.id}`} kind="similar" h="More like this" why={`Similar to “${b.seed.title}”, which you rate highly`} items={b.photos} more />)}
          {d.complementary.map((b) => <Block key={`c${b.seed.id}`} kind="complementary" h="Would work beside it" why={`${b.reason} to “${b.seed.title}”, from another photoshoot`} items={b.photos} more />)}
          <Block kind="archive" h="Consider leaving out of review" why="Averaging under 2 after four sessions" items={d.archive} />
          {empty && <div className="empty">Nothing to suggest yet. Recommendations appear as photographs build up a review history.</div>}
          <p className="faint" style={{ fontSize: 12.5, maxWidth: 560 }}>
            Suggestions learn from what you rate and from what you accept or reject here.
            {!d.aiAssisted && ' They use colour and shape for now. Turn on AI in Settings to also use what is in each picture.'}
          </p>
        </>
      )}
    </div>
  );
}
