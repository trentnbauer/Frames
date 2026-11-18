import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { printsSummary } from '../screens/walls';
import { greetingFor } from '../pages/Today';
import { GearIcon } from '../components/GearSystems';
import type { WishlistData } from '../components/HomeWishlist';
import { useStore } from '../store';
import { buildTasks } from '../todoTasks';
import { SUB } from './TodoList';
import { MiniWall } from './MiniWall';
import { Eyebrow, Row, primaryBtn } from './ui';

type Idea = { aiAssisted?: boolean; name: string; reason: string; photoIds: number[]; photos: (PhotoLite & { ar: number })[]; tags?: string[]; colours?: { name: string; hex: string }[] };
type Batch = { id: number; name: string; count: number; days: number; covers: number[]; done: boolean };
const thumb = (id: number) => imgUrl(id, 'thumb');

/** Home on a phone: greeting, the review due, the first to-dos, swipeable ideas, batches to organise, a composition to finish, community review and the wishlist. */
export function MobileHome() {
  const nav = useNavigate();
  const { summary: s, me, todoItems } = useStore();
  const recs = useApi<Idea[]>('/collections/suggestions');
  const comps = useApi<Collection[]>('/collections');
  const shoots = useApi<Shoot[]>('/shoots');
  const batches = useApi<{ batches: Batch[]; left: number }>('/home/batches');
  const community = useApi<{ enabled: boolean; waiting: number; showOnHome: boolean }>('/community/summary');
  const gear = useApi<WishlistData>('/gear/items');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const ideas = (recs.data ?? []).filter((x) => !dismissed.has(x.name));
  const wip = (comps.data ?? []).filter((c) => c.photoIds.length > 0 && !c.printedAt)[0];
  const firstName = (me?.displayName || me?.user?.name || '').split(' ')[0];
  const tasks = useMemo(() => buildTasks(todoItems), [todoItems]);
  const due = s?.due ?? 0;
  const openBatches = (batches.data?.batches ?? []).filter((b) => !b.done);
  const todoRows = [
    ...(due > 0 ? [{ label: 'Photographs due for review', sub: 'Rate them again', count: due, go: () => nav('/review') }] : []),
    ...tasks.rows.map((r) => ({ label: r.row, sub: SUB[r.key], count: r.n, go: () => nav(`/todo?task=${r.key}`) })),
  ];
  const todoTotal = todoRows.reduce((n, r) => n + r.count, 0);
  const startIdea = async (idea: Idea) => {
    setErr('');
    try {
      const c = await api<Collection>('/collections', { body: { name: idea.name, photoIds: idea.photoIds } });
      await api('/recommendations/feedback', { body: { kind: 'together', photoIds: idea.photoIds, verdict: 'accept' } });
      nav(`/collections/${c.id}`);
    } catch (e) { setErr((e as Error).message); }
  };
  const notMe = (idea: Idea) => { api('/recommendations/feedback', { body: { kind: 'together', photoIds: idea.photoIds, verdict: 'reject' } }).catch(() => undefined); setDismissed((d) => new Set(d).add(idea.name)); };
  const begin = () => nav(s && s.due === 0 && !s.resumable && s.early > 0 ? '/review?early' : '/review');
  const wish = gear.data?.want ?? [];

  return (
    <div className="pscreen ptab" style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ font: '400 42px/1 var(--serif)', margin: 0, letterSpacing: '-.01em' }}>{greetingFor(new Date().getHours())}{firstName ? `, ${firstName}.` : ''}</h1>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(s?.total ?? 0).toLocaleString()} photographs · {shoots.data?.length ?? 0} shoots · {comps.data?.length ?? 0} compositions</span>
      </div>

      {s && (s.due > 0 || s.resumable || s.early > 0) && (
        <div style={{ position: 'relative', borderRadius: 16, background: 'var(--surface)' }}>
          {s.nextId && <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 16 }}><div style={{ position: 'absolute', inset: -40, background: `url(${thumb(s.nextId)}) center/cover`, filter: 'var(--home-review-image-filter)', opacity: 'var(--home-review-image-opacity)' as never }} /></div>}
          <div style={{ position: 'relative', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Eyebrow>{due > 0 ? 'REVIEW · DUE NOW' : s.resumable ? 'IN PROGRESS' : 'ANYTIME'}</Eyebrow><span style={{ font: '400 11px var(--mono)', color: 'var(--faint)' }}>{due > 0 ? `about ${s.minutes} min` : ''}</span></div>
            {s.nextId && <div style={{ display: 'flex', gap: 4 }}><div style={{ width: 52, height: 64, borderRadius: 3, background: `url(${thumb(s.nextId)}) center/cover var(--hair)` }} /></div>}
            <h2 style={{ font: '400 30px/1.05 var(--serif)', margin: 0, textWrap: 'pretty' as never }}>{due > 0 ? `${due} ${due === 1 ? 'photo is' : 'photos are'} waiting for your rating` : 'Nothing is due for review'}</h2>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)', textWrap: 'pretty' as never }}>{due > 0 ? `${s.shootNames.length ? `From ${s.shootNames.join(' and ')}` : ''}` : 'Come back when the next ones are due, or begin anyway with the photographs you have not seen for longest.'}</p>
            <button onClick={begin} style={primaryBtn}>{s.resumable ? 'Resume review' : due === 0 ? 'Review anyway' : 'Begin review'}</button>
          </div>
        </div>
      )}

      {todoRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 6 }}><Eyebrow>TO DO · {todoTotal}</Eyebrow><button onClick={() => nav('/todo')} style={{ height: 32, fontSize: 13, color: 'var(--text2)' }}>All to do →</button></div>
          {todoRows.slice(0, 4).map((t) => <Row key={t.label} label={t.label} sub={t.sub} count={t.count} onClick={t.go} />)}
        </div>
      )}

      <div id="ideas" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><Eyebrow>IDEAS FOR YOU</Eyebrow>{ideas.length > 1 && <span style={{ font: '400 11px var(--mono)', color: 'var(--faint)' }}>Swipe ⟶</span>}</div>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -20px', padding: '0 20px', scrollbarWidth: 'none' }}>
          {ideas.map((idea) => (
            <div key={idea.name} style={{ flexShrink: 0, width: 292, scrollSnapAlign: 'center', background: 'var(--surface)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
              <div style={{ height: 118, display: 'flex', gap: 3, borderRadius: 8, overflow: 'hidden' }}>{idea.photos.slice(0, 4).map((p) => <div key={p.id} style={{ flex: `${p.ar || 1} 1 0`, minWidth: 0, background: `url(${thumb(p.id)}) center/cover var(--hair)` }} />)}</div>
              <h3 style={{ font: '400 25px/1.05 var(--serif)', margin: 0 }}>{idea.aiAssisted && <span aria-label="AI-assisted idea">✦ </span>}{idea.name}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(idea.tags ?? []).map((t) => <span key={t} style={{ height: 24, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 999, background: 'var(--hair)', fontSize: 12 }}>{t}</span>)}
                {(idea.colours ?? []).map((c) => <span key={c.name} style={{ height: 24, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px 0 6px', borderRadius: 999, background: 'var(--hair)', fontSize: 12 }}><i style={{ width: 12, height: 12, borderRadius: '50%', background: c.hex }} />{c.name}</span>)}
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: 'var(--muted)', textWrap: 'pretty' as never }}>{idea.reason}</p>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 'auto' }}>
                <button onClick={() => startIdea(idea)} style={{ height: 44, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Start composition</button>
                <button onClick={() => notMe(idea)} style={{ height: 44, padding: '0 12px', fontSize: 13.5, color: 'var(--text2)' }}>Skip idea</button>
              </div>
            </div>
          ))}
          {ideas.length === 0 && <div style={{ flex: 1, padding: 20, borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 13.5, color: 'var(--muted)' }}>{recs.loading ? 'Looking for sets…' : 'No more ideas for now. Rate more photographs to find new sets.'}</div>}
        </div>
      </div>

      {openBatches.length > 0 && (
        <button onClick={() => nav('/organise')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--hair)', textAlign: 'left' }}>
          <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>{openBatches[0].covers.slice(0, 2).map((id) => <i key={id} style={{ width: 30, height: 38, borderRadius: 2, background: `url(${thumb(id)}) center/cover var(--hair)` }} />)}</span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><Eyebrow>TO ORGANISE</Eyebrow><span style={{ fontSize: 14.5 }}>{openBatches.reduce((n, b) => n + b.count, 0)} new photos in {openBatches.length} batch{openBatches.length === 1 ? '' : 'es'}</span></span>
          <span style={{ color: 'var(--faint)' }}>›</span>
        </button>
      )}

      {wip && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Eyebrow>PICK UP WHERE YOU LEFT OFF</Eyebrow>
          <button onClick={() => nav(`/collections/${wip.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', background: 'var(--surface)', borderRadius: 14, padding: 14 }}>
            <MiniWall c={wip} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><span style={{ font: '400 24px/1.05 var(--serif)', overflowWrap: 'anywhere' }}>{wip.name}</span><span style={{ fontSize: 13, color: 'var(--text2)' }}>{wip.chosenIds.length} of {wip.layout.prints.length} prints chosen · {printsSummary(wip)}</span></div>
              <span style={{ flexShrink: 0, height: 40, display: 'inline-flex', alignItems: 'center', padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Continue ›</span>
            </div>
          </button>
        </div>
      )}

      {community.data?.enabled && (
        <button onClick={() => nav('/community')} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 18, borderRadius: 14, boxShadow: 'inset 0 0 0 1px var(--hair)', textAlign: 'left' }}>
          <Eyebrow>COMMUNITY REVIEW</Eyebrow>
          <span style={{ font: '400 26px/1.05 var(--serif)' }}>Rate other photographers’ work</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text2)' }}>Anonymous both ways · {community.data.waiting} photos waiting · reviewing helps your own photos get reviewed</span>
          <span style={{ alignSelf: 'flex-start', marginTop: 6, height: 44, display: 'inline-flex', alignItems: 'center', padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>Start community review</span>
        </button>
      )}

      {wish.length > 0 && (
        <div style={{ borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 32 }}><Eyebrow>WISHLIST</Eyebrow><button onClick={() => nav('/gear?view=wish')} style={{ height: 32, fontSize: 13, color: 'var(--text2)' }}>Full wishlist →</button></div>
          {wish.slice(0, 2).map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, borderTop: '1px solid var(--hair)' }}>
              <GearIcon type={w.type} />
              <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{w.name}</span>
              <span style={{ font: '400 12px var(--mono)', color: 'var(--text2)' }}>{w.price === null ? '' : `${gear.data?.prefs.currency ?? '$'}${w.price.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
