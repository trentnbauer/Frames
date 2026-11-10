/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Search.dc.html. Behaviour is the spec; the query, the understood chips, the hits and the
// photographs come in through props (see components/Search.tsx).
import { DCLogic } from './runtime';

export class Logic extends DCLogic {
  state = { hi: 0, pick: false, toast: '', tOp: 0 };
  componentWillUnmount() { clearTimeout(this.tT); }
  componentDidUpdate(pp) { if (pp.q !== this.props.q && this.state.hi !== 0) this.setState({ hi: 0 }); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const hits = P.hits || [];
    const hi = Math.min(S.hi, Math.max(0, hits.length - 1));
    const photos = P.photos || [];
    const n = P.count || photos.length;
    const ids = photos.map((p) => p.id);
    return {
      q: P.q, onQ: (e) => P.onQ(e.target.value),
      onKey: (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ hi: Math.min(hi + 1, hits.length - 1) }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ hi: Math.max(hi - 1, 0) }); }
        else if (e.key === 'Enter') { e.preventDefault(); if (hits[hi]) P.onOpenHit(hits[hi]); else if (photos.length) P.onOpenAll(); }
        else if (e.key === 'Escape') P.onClose();
      },
      hasChips: (P.chips || []).length > 0, chips: P.chips || [],
      hasFiles: (P.files || []).length > 0, files: (P.files || []).slice(0, 5),
      hasHits: hits.length > 0, hits: hits.map((h, i) => ({ name: h.name, meta: h.meta, src: h.src, bg: i === hi ? 'var(--hover)' : 'transparent', enter: i === hi ? '↵' : '', hover: () => this.setState({ hi: i }), open: () => P.onOpenHit(h) })),
      photoMeta: photos.length ? 'Photos · ' + n.toLocaleString() + (P.shootCount ? ' from ' + P.shootCount + (P.shootCount === 1 ? ' shoot' : ' shoots') : '') : 'Photos',
      searchRow: photos, noPhotos: !photos.length && !!P.q.trim() && !P.busy,
      actOp: photos.length ? 1 : 0.4, pickLabel: photos.length ? 'Pick from these ' + n.toLocaleString() : 'Pick from these',
      pickOpen: S.pick, togglePick: () => photos.length && this.setState({ pick: true }), closePick: () => this.setState({ pick: false }),
      compPicker: S.pick ? P.renderCompPicker(ids, () => this.setState({ pick: false }), (msg) => { this.setState({ pick: false }); this.flash(msg); }) : null,
      openAll: () => P.onOpenAll(), close: () => P.onClose(),
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
