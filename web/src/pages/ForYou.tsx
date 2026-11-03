import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PHOTOS, avg } from '../data';
import { Header, Img, Title } from '../components/bits';
import { useStore } from '../store';

export function ForYou() {
  const { settings } = useStore();
  const [dismissed, setDismissed] = useState<string[]>([]);
  if (settings.ai === 'off') {
    return (
      <div className="page"><Header /><Title>For you</Title>
        <div className="empty">Recommendations need AI. Turn it on in <Link to="/settings" className="t2" style={{ textDecoration: 'underline' }}>Settings</Link>.</div>
      </div>
    );
  }
  const rising = PHOTOS.filter((p) => p.reviews.length >= 3 && p.reviews[p.reviews.length - 1].rating > p.reviews[0].rating).slice(0, 6);
  const together = PHOTOS.filter((p) => p.tags.some((t) => t.name === 'fog')).slice(0, 6);
  const quiet = PHOTOS.filter((p) => p.reviews.length === 6 && avg(p.reviews) >= 3.5).slice(0, 6);

  const Strip = ({ items, badge }: { items: typeof PHOTOS; badge?: boolean }) => (
    <div className="strip">
      {items.map((p) => (
        <Link key={p.id} to={`/photo/${p.id}`} className="tile" style={{ aspectRatio: String(p.ar) }} aria-label={p.title}>
          <Img p={p} style={{ height: '100%', width: 'auto' }} />
          {badge && <em>{p.reviews[0].rating}.0 → {p.reviews[p.reviews.length - 1].rating}.0</em>}
        </Link>
      ))}
    </div>
  );
  const Block = ({ id, h, why, items, badge, actions }: { id: string; h: string; why: string; items: typeof PHOTOS; badge?: boolean; actions: string[] }) =>
    dismissed.includes(id) ? null : (
      <section className="fy">
        <div className="spread"><h2>{h}</h2><span className="muted" style={{ fontSize: 12 }}>{why}</span></div>
        <Strip items={items} badge={badge} />
        <div className="acts">
          {actions.map((a, i) => (
            <button key={a} className={'pill' + (i === 0 && actions.length > 1 ? '' : '')} onClick={() => a === 'Not for me' && setDismissed([...dismissed, id])}>{a}</button>
          ))}
        </div>
      </section>
    );

  return (
    <div className="page">
      <Header />
      <Title>For you</Title>
      <Block id="grow" h="Growing on you" why="Ratings rising across sessions" items={rising} badge actions={['Not for me']} />
      <Block id="together" h="Belongs together" why="Same mood, different shoots" items={together} actions={['Start a collection', 'Not for me']} />
      <Block id="quiet" h="Quietly excellent" why="4.5+ every session, in no collection" items={quiet} actions={['More like this', 'Not for me']} />
      {dismissed.length === 3 && <div className="empty">Nothing else for now. Your feedback shapes what shows up next.</div>}
    </div>
  );
}
