/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Comp Picker.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  get CL() { return (this.props.comps ?? []).map((c) => [c.name, c.meta]); }
  state = { mode: 'existing', q: '', sel: null, name: '' };
  renderVals() {
    const S = this.state; const P = this.props; const n = P.count ?? 1; const already = P.already || [];
    const sel = S.sel ?? [...already]; const q = S.q.trim().toLowerCase();
    const list = q ? this.CL.filter(([nm]) => nm.toLowerCase().includes(q)) : [...this.CL.filter(([nm]) => already.includes(nm)), ...this.CL.filter(([nm]) => !already.includes(nm)).slice(0, 5)];
    const firstOther = list.findIndex(([nm]) => !already.includes(nm));
    const added = sel.filter((x) => !already.includes(x)); const removed = already.filter((x) => !sel.includes(x));
    const ok = S.mode === 'new' || added.length || removed.length;
    const close = () => P.onClose && P.onClose();
    const what = n + (n === 1 ? ' photo' : ' photos');
    return {
      thumbList: (P.thumbs || []).slice(0, 3), title: n === 1 ? 'Add to composition' : 'Add ' + what + ' to…', sub: P.from || 'They become candidates, ranked by score',
      close, stop: (e) => e.stopPropagation(),
      modes: [['existing', 'Existing composition'], ['new', 'New composition']].map(([k, label]) => ({ label, bg: S.mode === k ? '#efede8' : 'transparent', fg: S.mode === k ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ mode: k }) })),
      isExisting: S.mode === 'existing', isNew: S.mode === 'new', q: S.q, onQ: (e) => this.setState({ q: e.target.value }), name: S.name, onName: (e) => this.setState({ name: e.target.value }),
      count: P.comps ? P.comps.length : 0, rows: list.map(([name, meta], i) => { const on = sel.includes(name); return { name, meta: already.includes(name) ? 'Already in' : meta, head: i === 0 && already.length && !q ? 'Already in · ' + already.length : i === firstOther && !q ? 'Recently edited' : '', headShow: !q && (i === 0 && already.length || i === firstOther) ? 'block' : 'none', tick: on ? '✓' : '', boxBg: on ? '#efede8' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.3)', toggle: () => this.setState({ sel: on ? sel.filter((x) => x !== name) : [...sel, name] }) }; }),
      goOp: ok ? 1 : 0.4, goLabel: S.mode === 'new' ? 'Create and continue' : added.length > 1 ? 'Add to ' + added.length + ' compositions' : removed.length && !added.length ? 'Save' : 'Add to composition',
      go: () => { if (!ok) return; if (S.mode === 'new') { P.onDone && P.onDone(null, '', S.name.trim()); return; } const msg = added.length ? what + ' added to ' + (added.length > 1 ? added.length + ' compositions' : added[0]) : 'Removed from ' + removed.join(', '); P.onDone && P.onDone(sel, msg, ''); close(); },
    };
  }
}
