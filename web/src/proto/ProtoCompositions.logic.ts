/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Compositions.dc.html. Behaviour is the spec; the data and the actions come in through props
// (see screens/Compositions.tsx). Each composition: { id, name, prints, status, pct, gap, wall: [{ w, h, frame, mat, matPad, img, empty }], ... }.
import { DCLogic } from './runtime';
import { addShortcuts } from '../components/shortcuts';

export class Logic extends DCLogic {
  state = { tab: '', toast: '', tOp: 0, exp: {} };
  componentDidMount() { this.offKeys = addShortcuts(() => [{ key: 'n', label: 'New composition', run: () => this.props.onNew() }]); }
  componentWillUnmount() { this.offKeys?.(); clearTimeout(this.tT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  renderVals() {
    const S = this.state, P = this.props;
    const tab = S.tab || P.initialTab || 'progress';
    const prog = ((tab === 'review' ? P.review : P.prog) || []).map((c) => ({ ...c, open: () => P.onOpen(c.id) }));
    const ready = (P.ready || []).map((c) => ({
      ...c, open: () => P.onOpen(c.id),
      exportLabel: S.exp[c.id] ? '✓ Exported · again' : 'Export originals',
      export: async () => { this.setState((s) => ({ exp: { ...s.exp, [c.id]: true } })); this.flash('Exporting ' + c.name + ' · originals download one by one'); await P.onExport(c.id); },
      sheet: () => { P.onSheet(c.id); this.flash('Downloading ' + c.name + ' print sheet.pdf'); },
    }));
    return {
      compsAfter: prog, ready, readyEmpty: !ready.length,
      tabs: [['progress', 'Progress', (P.prog || []).length], ['review', 'Review', (P.review || []).length], ['done', 'Done', ready.length]].map(([k, label, n]) => ({ label, n, stage: k, selected: tab === k, bg: tab === k ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'transparent', fg: tab === k ? 'var(--text)' : 'var(--text2)', go: () => this.setState({ tab: k }) })),
      sortLabel: P.sortLabel(tab), toggleSort: P.onToggleSort,
      isProg: tab !== 'done', isReady: tab === 'done',
      newComp: P.onNew, q: P.q, onQ: P.onQ, sugg: tab === 'progress' ? P.sugg : null,
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
