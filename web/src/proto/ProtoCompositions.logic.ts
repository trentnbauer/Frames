/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Compositions.dc.html. Behaviour is the spec; the data and the actions come in through props
// (see screens/Compositions.tsx). Each composition: { id, name, prints, status, pct, gap, wall: [{ w, h, frame, mat, matPad, img, empty }], ... }.
import { DCLogic } from './runtime';

export class Logic extends DCLogic {
  state = { tab: 'prog', toast: '', tOp: 0, exp: {} };
  componentWillUnmount() { clearTimeout(this.tT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const tab = S.tab;
    const prog = (P.prog || []).map((c) => ({ ...c, open: () => P.onOpen(c.id) }));
    const ready = (P.ready || []).map((c) => ({
      ...c, open: () => P.onOpen(c.id),
      exportLabel: S.exp[c.id] ? '✓ Exported · again' : 'Export originals',
      export: async () => { this.setState((s) => ({ exp: { ...s.exp, [c.id]: true } })); this.flash('Exporting ' + c.name + ' · originals download one by one'); await P.onExport(c.id); },
      sheet: () => { P.onSheet(c.id); this.flash('Downloading ' + c.name + ' print sheet.pdf'); },
      printed: async () => { await P.onPrinted(c.id); this.flash(c.name + ' moved to Printed'); },
    }));
    const printed = (P.printedList || []).map((c) => ({ ...c, open: () => P.onOpen(c.id), again: () => { P.onOpen(c.id); } }));
    return {
      compsAfter: prog, ready, printed, readyEmpty: !ready.length,
      tabs: [['prog', 'In progress', prog.length], ['ready', 'Ready to export', ready.length], ['printed', 'Printed', printed.length]].map(([k, label, n]) => ({ label, n, bg: tab === k ? 'rgba(255,255,255,.1)' : 'transparent', fg: tab === k ? '#efede8' : '#a8a59f', go: () => this.setState({ tab: k }) })),
      sortLabel: P.sortLabel(tab), toggleSort: P.onToggleSort,
      isProg: tab === 'prog', isReady: tab === 'ready', isPrinted: tab === 'printed',
      pStats: P.pStats || [], printedMore: P.printedMore || '',
      newComp: P.onNew, q: P.q, onQ: P.onQ, sugg: P.sugg,
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
