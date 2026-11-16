import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Shoot } from '../data';
import { useStore } from '../store';
import { Eyebrow, Row, primaryBtn } from './ui';

/** The Review tab: what is due, due by shoot, and the other ways to review (anyway, removal, community, recently removed, schedule). */
export function MobileReviewTab() {
  const nav = useNavigate();
  const { summary: s } = useStore();
  const shoots = useApi<Shoot[]>('/shoots');
  const community = useApi<{ enabled: boolean; waiting: number }>('/community/summary');
  const [removals, setRemovals] = useState(0);
  useEffect(() => { api<{ photos: unknown[] }>('/photos/delete-suggestions').then((r) => setRemovals(r.photos.length)).catch(() => undefined); }, []);
  const due = s?.due ?? 0;
  const dueShoots = (shoots.data ?? []).filter((x) => x.dueCount > 0).sort((a, b) => b.dueCount - a.dueCount);
  const begin = () => nav(s && s.due === 0 && !s.resumable ? '/review?early' : '/review');
  return (
    <div className="pscreen ptab headless" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      <h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Review</h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, borderRadius: 16, background: 'var(--surface)' }}>
        <Eyebrow>{due ? 'DUE NOW' : s?.resumable ? 'IN PROGRESS' : 'ANYTIME'}</Eyebrow>
        <span style={{ font: '400 34px/1.05 var(--serif)', textWrap: 'pretty' as never }}>{due ? `${due} ${due === 1 ? 'photograph is' : 'photographs are'} waiting for your rating` : 'Nothing is waiting to be seen again'}</span>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)', textWrap: 'pretty' as never }}>Rate each photograph again over time. Ratings rank your compositions and decide what comes back for review.</p>
        <button onClick={begin} style={primaryBtn}>{s?.resumable ? 'Resume review' : due ? 'Begin review' : 'Review anyway'}</button>
      </div>
      {dueShoots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Eyebrow style={{ paddingBottom: 6 }}>DUE BY SHOOT</Eyebrow>
          {dueShoots.map((x) => <Row key={x.id} label={x.name} thumb={x.coverId ? imgUrl(x.coverId, 'thumb') : ''} meta={`${x.dueCount} due`} onClick={() => nav(`/shoots/${x.id}`)} />)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <Eyebrow style={{ paddingBottom: 6 }}>MORE</Eyebrow>
        <Row label="Review anyway" sub="The photographs you have not seen for longest" onClick={() => nav('/review?early')} />
        {removals > 0 && <Row label="Removal review" sub={`${removals} ${removals === 1 ? 'photograph is' : 'photographs are'} below your threshold`} onClick={() => nav('/removals')} />}
        {community.data?.enabled && <Row label="Community review" sub={`${community.data.waiting} photos from other photographers · anonymous`} onClick={() => nav('/community')} />}
        <Row label="Recently removed" sub="Restore within the retention period" onClick={() => nav('/activity')} />
        <Row label="Review schedule" sub="How often photographs come back" onClick={() => nav('/review-schedule')} />
      </div>
    </div>
  );
}
