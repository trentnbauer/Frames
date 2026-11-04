import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { useStore } from '../store';
import type { PhotoLite } from '../data';
import { Header, Justified, Loading, Title } from '../components/bits';

type Item = { key: string; title: string; detail: string; count: number; photoIds: number[]; link?: string };
type Todo = { total: number; kinds: number; items: Item[] };

/** Everything waiting on you: approvals, photographs with nothing set yet, an account to reconnect. */
export function Todo() {
  const todo = useApi<Todo>('/todo');
  const { refreshSummary } = useStore();
  const acceptAll = async (kind: 'tags' | 'description', n: number) => {
    if (!window.confirm(`Accept all ${n.toLocaleString()} ${n === 1 ? 'photograph’s' : 'photographs’'} AI suggestions?\n\nThe suggested ${kind === 'tags' ? 'tags and subjects' : 'descriptions'} become yours. You can still remove or edit any of them on the photograph’s page.`)) return;
    await api('/todo/accept-ai', { body: { kind } });
    todo.reload(); refreshSummary();
  };
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const d = todo.data;
  return (
    <div className="page">
      <Header />
      <Title count={d ? `${d.total.toLocaleString()} ${d.total === 1 ? 'thing' : 'things'}` : undefined}>To do</Title>
      {(todo.loading || todo.error) && <Loading error={todo.error} />}
      {d && d.items.length === 0 && <div className="empty">Nothing is waiting on you. New photographs, and anything the AI suggests, show up here.</div>}
      {d?.items.map((i) => {
        const photos = i.photoIds.map((id) => byId.get(id)).filter((p): p is PhotoLite => !!p);
        return (
          <section key={i.key} className="group" aria-label={i.title}>
            <div className="spread" style={{ alignItems: 'baseline' }}>
              <h2 className="serif" style={{ fontSize: 28, margin: 0 }}>{i.title}</h2>
              <span className="muted" style={{ fontSize: 12.5 }}>{i.key === 'cloud' ? '' : `${i.count.toLocaleString()} ${i.count === 1 ? 'photograph' : 'photographs'}`}</span>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px', maxWidth: 640 }}>{i.detail}</p>
            {i.link && <Link to={i.link} className="pill primary">Open</Link>}
            {(i.key === 'ai-tags' || i.key === 'ai-description') && <button className="pill" style={{ marginBottom: 12 }} onClick={() => acceptAll(i.key === 'ai-tags' ? 'tags' : 'description', i.count)}>Accept all {i.count.toLocaleString()}</button>}
            {(i.key === 'subjects' || i.key === 'tags') && <Link to={`/library?missing=${i.key === 'subjects' ? 'subject' : 'tag'}`} className="pill" style={{ marginBottom: 12 }}>See all {i.count.toLocaleString()} in the Library</Link>}
            {photos.length > 0 && <Justified photos={photos} h={110} />}
            {i.count > photos.length && photos.length > 0 && <p className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>Showing the newest {photos.length}. The rest appear here as you finish these.</p>}
          </section>
        );
      })}
    </div>
  );
}
