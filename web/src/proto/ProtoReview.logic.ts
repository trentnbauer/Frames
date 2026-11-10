/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Review.dc.html. Behaviour is the spec; the session, the photograph and the actions come in
// through props (see screens/Review.tsx). Previous ratings are never shown: the review is blind by design.
import React from 'react';
import { DCLogic } from './runtime';

export class Logic extends DCLogic {
  state = { more: false, del: false, delMode: 'frames', pick: false, noting: false, toast: '', tOp: 0 };
  componentWillUnmount() { window.removeEventListener('keydown', this.onKey); clearTimeout(this.tT); }
  componentDidMount() {
    this.onKey = (e) => {
      const P = this.props, S = this.state;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || S.del || S.pick) return;
      if (/^[1-5]$/.test(e.key)) P.onRate(+e.key);
      else if ((e.key === 'a' || e.key === 'A') && P.offer) { e.preventDefault(); P.onAddOffer(); }
      else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.setState({ noting: true }); }
      else if (e.key === 'ArrowLeft') P.onBack();
      else if (e.key === ' ') { e.preventDefault(); P.onSkip(); }
      else if (e.key === 'Escape') P.onFinish();
    };
    window.addEventListener('keydown', this.onKey);
  }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const mode = S.delMode;
    const close = (t, fn) => async () => { this.setState({ more: false }); if (fn) await fn(); if (t) this.flash(t); };
    const sel = P.rating;
    return {
      progress: Array.from({ length: P.total }, (_, i) => (i < P.index ? '#efede8' : i === P.index ? '#a8a59f' : 'rgba(255,255,255,.12)')),
      idxLabel: Math.min(P.index + 1, P.total), total: P.total, shootName: P.shootName || '', photoSrc: P.photoSrc, finish: P.onFinish,
      ratingsAfter: R.map(([emoji, label], i) => ({ emoji, label, value: i + 1, bg: sel === i + 1 ? 'rgba(255,255,255,.14)' : 'transparent', col: sel === i + 1 ? '#efede8' : '#a8a59f', pick: () => P.onRate(i + 1) })),
      revMoreOpen: S.more, toggleRevMore: () => this.setState({ more: !S.more }), revMoreFg: S.more ? '#efede8' : '#8f8c86', revMoreBg: S.more ? 'rgba(255,255,255,.08)' : 'transparent',
      revItems: [
        { label: 'Skip for now', key: 'Space', sep: 'none', fg: '#efede8', to: '', go: close('Skipped · it comes back next session', () => P.onSkip()) },
        { label: 'Add to composition…', key: 'A', sep: 'none', fg: '#efede8', to: '', go: () => this.setState({ more: false, pick: true }) },
        { label: 'Open photo page', key: 'O', sep: 'none', fg: '#efede8', to: '', go: () => { this.setState({ more: false }); P.onOpenPhoto(); } },
        { label: 'Leave out of review', key: '', sep: 'block', fg: '#efede8', to: '', go: close('Left out · it won’t come back for review', () => P.onLeaveOut()) },
        { label: 'Undo last rating', key: '', sep: 'none', fg: '#efede8', to: '', go: close('Last rating undone', () => P.onUndo()) },
        { label: 'Delete photo…', key: '', sep: 'block', fg: 'oklch(0.75 0.14 28)', to: '', go: () => this.setState({ more: false, del: true }) },
      ],
      revToast: S.toast, revToastOp: S.tOp, rToast: '', rToastOp: 0,
      delOpen: S.del, closeDel: () => this.setState({ del: false }), stop: (e) => e.stopPropagation(),
      delSub: P.delSub, delWarn: P.delWarn,
      delOpts: [['frames', 'Remove from Frames', 'The original stays on disk. You can import it again later.'], ['trash', 'Also move the original to the trash', P.trashHint]].map(([k, label, hint]) => ({ label, hint, bg: mode === k ? 'rgba(255,255,255,.06)' : 'transparent', ring: mode === k ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: mode === k ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => this.setState({ delMode: k }) })),
      delLabel: mode === 'trash' ? 'Delete and trash file' : 'Delete photo',
      confirmDel: async () => { this.setState({ del: false }); await P.onDelete(mode); this.flash(mode === 'trash' ? 'Deleted · original moved to trash' : 'Deleted from Frames · original kept'); },
      offer: P.offer, quickAdd: () => P.onAddOffer(), openRPick: () => { P.onChooseOffer(); this.setState({ pick: true }); },
      compPicker: S.pick ? P.renderCompPicker(() => this.setState({ pick: false }), (m) => { this.setState({ pick: false }); this.flash(m); }) : null,
      noteBox: S.noting ? React.createElement('div', { style: { position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)', width: 420, background: '#1e1e1d', borderRadius: 12, padding: 14, boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 20 } },
        React.createElement('textarea', { autoFocus: true, rows: 3, placeholder: 'A note for this photograph…', defaultValue: P.note || '', style: { background: '#0d0d0d', border: 0, outline: 'none', borderRadius: 8, color: '#efede8', padding: 10, font: "400 14px/1.4 'IBM Plex Sans',sans-serif", boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)' },
          onBlur: (e) => P.onNote(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); P.onNote(e.target.value); this.setState({ noting: false }); } } }),
        React.createElement('div', { style: { fontSize: 11.5, color: '#6f6c67' } }, 'Enter to save · Esc to close')) : null,
      errorBox: P.error ? React.createElement('div', { role: 'alert', style: { position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center', fontSize: 13, color: '#e79a82' } }, P.error) : null,
    };
  }
}
