import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../components/Sheet';
import { RATINGS } from '../data';
import { primaryBtn } from './ui';

type Props = {
  loading: boolean; src: string | null; who: string; kit: string; progress: string; seen: number; total: number;
  onRate: (rating: number) => void; onSkip: () => void; onReport: (reason: string, note: string) => void; onRestart: () => void;
};
const REASONS: [string, string][] = [['nudity', 'Nudity or adult content'], ['violence', 'Violence'], ['not-mine', 'Not a photograph'], ['other', 'Something else']];

/** Community review on a phone: the same layout as a review session, with Report and Skip. Anonymous both ways. */
export function MobileCommunity({ loading, src, who, kit, progress, seen, total, onRate, onSkip, onReport, onRestart }: Props) {
  const nav = useNavigate();
  const [rep, setRep] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const shell = { position: 'fixed', inset: 0, zIndex: 60, background: '#000', color: '#efede8' } as const;
  if (!src) {
    return (
      <div style={{ ...shell, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: '0 28px' }} data-screen-label="Community review">
        <span style={{ font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', color: '#6f6c67' }}>COMMUNITY REVIEW</span>
        <span style={{ font: "400 46px/1 'Instrument Serif',Georgia,serif" }}>{loading ? 'Looking for photographs…' : 'All caught up.'}</span>
        {!loading && <span style={{ fontSize: 14, lineHeight: 1.5, color: '#a8a59f' }}>There is nothing else to review right now. Share some of your own photographs and more will come back.</span>}
        {!loading && <button onClick={onRestart} style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.25)', fontSize: 14 }}>Look again</button>}
        <button onClick={() => nav('/')} style={{ ...primaryBtn, background: '#efede8', color: '#0d0d0d', marginTop: 12 }}>Done</button>
      </div>
    );
  }
  const btn = { height: 44, padding: '0 12px', fontSize: 13, color: '#a8a59f' } as const;
  return (
    <div role="dialog" aria-label="Community review" data-screen-label="Community review" style={shell}>
      <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 16, right: 16, display: 'flex', gap: 2 }}>
        {Array.from({ length: Math.min(Math.max(total, 1), 40) }, (_, i) => <i key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < seen - 1 ? '#efede8' : i === seen - 1 ? 'rgba(239,237,232,.55)' : 'rgba(239,237,232,.14)' }} />)}
      </div>
      <div style={{ position: 'absolute', top: 'max(28px, calc(env(safe-area-inset-top) + 14px))', left: 20, right: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ font: "italic 400 24px/1 'Instrument Serif',Georgia,serif" }}>{seen} <span style={{ color: '#6f6c67' }}>/ {total}</span></span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#8f8c86', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Community review</span>
        <button onClick={() => nav('/')} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'rgba(255,255,255,.08)', color: '#a8a59f', fontSize: 13 }}>Finish</button>
      </div>
      <div style={{ position: 'absolute', top: 84, bottom: 236, left: 12, right: 12 }}><div role="img" aria-label="Photograph to rate" style={{ width: '100%', height: '100%', background: `url(${src}) center/contain no-repeat` }} /></div>
      <div style={{ position: 'absolute', bottom: 196, left: 20, right: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ font: "400 22px/1.1 'Instrument Serif',Georgia,serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{who}</span>
        <span style={{ fontSize: 11.5, color: '#6f6c67', whiteSpace: 'nowrap' }}>{kit}</span>
      </div>
      <div style={{ position: 'absolute', bottom: 136, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={() => { setReason(''); setNote(''); setRep(true); }} style={btn}>⚑ Report</button>
        <span style={{ ...btn, display: 'grid', placeItems: 'center', color: '#6f6c67' }}>{progress}</span>
        <button onClick={onSkip} style={btn}>Skip →</button>
      </div>
      <div style={{ position: 'absolute', bottom: 38, left: 12, right: 12, display: 'flex', gap: 4, padding: 6, borderRadius: 26, background: 'rgba(30,30,29,.94)', boxShadow: '0 0 0 1px rgba(255,255,255,.08)' }}>
        {RATINGS.map((r) => <button key={r.value} onClick={() => onRate(r.value)} aria-label={`Rate ${r.label}`} style={{ flex: 1, height: 74, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}><span style={{ fontSize: 26, lineHeight: 1 }}>{r.emoji}</span><span style={{ fontSize: 11.5, color: '#a8a59f' }}>{r.label}</span></button>)}
      </div>
      {rep && (
        <Sheet title="Report this photograph" sub="It is hidden for you and sent to moderators." onClose={() => setRep(false)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>{REASONS.map(([k, l]) => <button key={k} aria-pressed={reason === k} onClick={() => setReason(k)} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, borderTop: '1px solid var(--hair)', textAlign: 'left' }}><span style={{ width: 18, height: 18, borderRadius: '50%', boxShadow: `inset 0 0 0 ${reason === k ? 5 : 1.5}px ${reason === k ? 'var(--text)' : 'var(--outline)'}` }} /><span style={{ fontSize: 15 }}>{l}</span></button>)}</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" aria-label="Note" style={{ height: 46, border: 0, outline: 'none', borderRadius: 12, padding: '0 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 15 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setRep(false)} style={{ height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Cancel</button><button disabled={!reason} onClick={() => { setRep(false); onReport(reason, note); }} style={{ ...primaryBtn, height: 46, padding: '0 22px', fontSize: 14.5, opacity: reason ? 1 : 0.4 }}>Report</button></div>
        </Sheet>
      )}
    </div>
  );
}
