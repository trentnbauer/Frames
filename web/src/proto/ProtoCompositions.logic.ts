/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Compositions.dc.html. Behaviour is the spec; the data and the actions come in through props
// (see screens/Compositions.tsx). Each composition: { id, name, prints, status, pct, gap, wall: [{ w, h, frame, mat, matPad, img, empty }], ... }.
import { DCLogic } from './runtime';

export class Logic extends DCLogic {
  state = { toast: '', tOp: 0, exp: {} };
  componentWillUnmount() { clearTimeout(this.tT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const tab = P.tab || 'progress';
    const prog = ((tab === 'review' ? P.review : P.prog) || []).map((c) => ({ ...c, open: () => P.onOpen(c.id) }));
    const ready = (P.ready || []).map((c) => ({
      ...c, open: () => P.onOpen(c.id),
      exportLabel: S.exp[c.id] ? '✓ Exported · again' : 'Export originals',
      export: async () => { this.setState((s) => ({ exp: { ...s.exp, [c.id]: true } })); this.flash('Exporting ' + c.name + ' · originals download one by one'); await P.onExport(c.id); },
      sheet: () => { P.onSheet(c.id); this.flash('Downloading ' + c.name + ' print sheet.pdf'); },
    }));
    return {
      compsAfter: prog, ready, readyEmpty: !ready.length,
      isProg: tab !== 'done', isReady: tab === 'done',
      sugg: tab === 'progress' ? P.sugg : null,
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
