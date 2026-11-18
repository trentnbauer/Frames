import { useNavigate } from 'react-router-dom';
import { imgUrl } from '../api';
import { useStore } from '../store';
import { Eyebrow } from './ui';

/** The compact review prompt shared by Home and To do: cover, state, a short title and one button (Begin, Resume or Review anyway). */
export function ReviewCard() {
  const nav = useNavigate();
  const { summary: s } = useStore();
  if (!s) return null;
  const due = s.due;
  const label = s.resumable ? 'Resume' : due > 0 ? 'Begin' : 'Review anyway';
  const eyebrow = due > 0 ? `REVIEW · DUE NOW · ${s.minutes} MIN` : s.resumable ? 'REVIEW · IN PROGRESS' : 'REVIEW · ANYTIME';
  const title = due > 0 ? `${due} ${due === 1 ? 'photo' : 'photos'} to rate` : 'Nothing is due for review';
  const go = () => nav(!due && !s.resumable && s.early > 0 ? '/review?early' : '/review');
  return (
    <div style={{ position: 'relative', borderRadius: 16, background: 'var(--surface)' }}>
      {s.nextId && <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 16 }}><div style={{ position: 'absolute', inset: -40, background: `url(${imgUrl(s.nextId, 'thumb')}) center/cover`, filter: 'var(--home-review-image-filter)', opacity: 'var(--home-review-image-opacity)' as never }} /></div>}
      <div style={{ position: 'relative', padding: 14, display: 'flex', alignItems: 'center', gap: 14, minHeight: 78, boxSizing: 'border-box' }}>
        {s.nextId && <div style={{ width: 44, height: 56, flexShrink: 0, borderRadius: 3, background: `url(${imgUrl(s.nextId, 'thumb')}) center/cover var(--hair)` }} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow style={{ fontSize: 10.5, letterSpacing: '.05em' }}>{eyebrow}</Eyebrow>
          <span style={{ font: '400 21px/1.1 var(--serif)', textWrap: 'pretty' as never }}>{title}</span>
        </div>
        <button onClick={go} style={{ flexShrink: 0, height: 40, padding: '0 18px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14 }}>{label}</button>
      </div>
    </div>
  );
}
