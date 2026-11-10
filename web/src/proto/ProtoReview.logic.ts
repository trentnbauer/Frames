/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Review.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { idx: 12, more: false, picker: false, pickQ: '', inSet: ['Kitchen wall', 'Portraits 2026', 'Studio feature'], pt: '', pf: false, ptext: '', rateOpen: false, mine: null, note: '', ai: 'idle', acc: [], det: { camera: 'X-T5', lens: '56mm', ap: 'f/1.2', place: 'Fremantle' } };
  rflash(t) { this.setState({ rToast: t, rtOp: 1 }); clearTimeout(this.rtT); this.rtT = setTimeout(() => this.setState({ rtOp: 0 }), 1800); }
  componentDidMount() { this.onKey = (e) => { if (e.target.tagName === 'INPUT') return; if ((e.key === 'a' || e.key === 'A') && !this.state.rPick) { this.rflash('Added to Kitchen wall as a candidate'); return; } if (e.key === 'r' || e.key === 'R') this.setState((s) => ({ rateOpen: !s.rateOpen })); else if (this.state.rateOpen && /^[1-5]$/.test(e.key)) this.setState({ mine: +e.key }); else if (e.key === 'Escape') this.setState({ rateOpen: false }); }; window.addEventListener('keydown', this.onKey); }
  componentWillUnmount() { window.removeEventListener('keydown', this.onKey); clearTimeout(this.aiT); clearTimeout(this.ptT); }
  delVals() {
    const S = this.state; const mode = S.delMode || 'frames';
    const O = [['frames', 'Remove from Frames', 'The original stays on disk. You can import it again later.'], ['trash', 'Also move the original to the trash', 'DSCF4182.RAF and its XMP sidecar · 24 MB']];
    return {
      delOpen: !!S.del, closeDel: () => this.setState({ del: false }),
      delOpts: O.map(([k, label, hint]) => ({ label, hint, bg: mode === k ? 'rgba(255,255,255,.06)' : 'transparent', ring: mode === k ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: mode === k ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => this.setState({ delMode: k }) })),
      delLabel: mode === 'trash' ? 'Delete and trash file' : 'Delete photo',
      confirmDel: () => { const t = mode === 'trash' ? 'Deleted · original moved to trash' : 'Deleted from Frames · original kept'; this.setState({ del: false, revT: t, revTO: 1, ptext: t, pt: 1 }); clearTimeout(this.rvT); this.rvT = setTimeout(() => this.setState({ revTO: 0, pt: 0 }), 2200); },
    };
  }
  revVals() {
    const S = this.state; const close = (t) => () => { this.setState({ revMore: false, revT: t, revTO: 1 }); clearTimeout(this.rvT); this.rvT = setTimeout(() => this.setState({ revTO: 0 }), 1800); };
    return {
      revMoreOpen: !!S.revMore, toggleRevMore: () => this.setState({ revMore: !S.revMore }), revMoreFg: S.revMore ? '#efede8' : '#8f8c86', revMoreBg: S.revMore ? 'rgba(255,255,255,.08)' : 'transparent',
      revToast: S.revT || '', revToastOp: S.revTO ? 1 : 0,
      revItems: [
        { label: 'Skip for now', key: 'Space', sep: 'none', fg: '#efede8', to: '', go: close('Skipped · it comes back next session') },
        { label: 'Add to composition…', key: 'A', sep: 'none', fg: '#efede8', to: '', go: close('Would open the composition picker') },
        { label: 'Open photo page', key: 'O', sep: 'none', fg: '#efede8', to: 'photo', go: () => this.setState({ revMore: false }) },
        { label: 'Leave out of review', key: '', sep: 'block', fg: '#efede8', to: '', go: close('Left out · it won’t come back for review') },
        { label: 'Undo last rating', key: '⌘Z', sep: 'none', fg: '#efede8', to: '', go: close('Rating for photo 3 undone') },
        { label: 'Delete photo…', key: '', sep: 'block', fg: 'oklch(0.75 0.14 28)', to: '', go: () => this.setState({ revMore: false, del: true }) },
      ],
    };
  }
  ptoast(t) { this.setState({ ptext: t, pt: 1 }); clearTimeout(this.ptT); this.ptT = setTimeout(() => this.setState({ pt: 0 }), 1800); }
  barVals() {
    const S = this.state;
    const all = [['Kitchen wall', 'Print 2 · A3'], ['Portraits 2026', 'Candidate'], ['Studio feature', 'Candidate'], ['Hallway triptych', 'yesterday'], ['Mum’s birthday', 'last week'], ['Blue hour', '2 weeks ago'], ['Cars & chrome', 'Oct 2026'], ['Office A2', 'Sep 2026'], ['Autumn hallway', 'Aug 2026']];
    const q = S.pickQ.trim().toLowerCase();
    const pool = q ? all.filter(([n]) => n.toLowerCase().includes(q)) : all.slice(0, 7);
    const ins = pool.filter(([n]) => S.inSet.includes(n)); const outs = pool.filter(([n]) => !S.inSet.includes(n));
    const mkRow = ([name, st], i, head) => { const on = S.inSet.includes(name); return { name, state: on ? st : (q ? 'Composition' : st), head, headShow: i === 0 && !q ? 'block' : 'none', tick: on ? '✓' : '', boxBg: on ? '#efede8' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.3)', toggle: () => this.setState((s) => ({ inSet: on ? s.inSet.filter((x) => x !== name) : [...s.inSet, name] })) }; };
    const fav = !!S.fav; const inPf = S.inPf !== false;
    const close = (t) => () => { this.setState({ more: false }); this.ptoast(t); };
    return {
      photoIdx: S.idx, prevPhoto: () => this.setState({ idx: S.idx > 1 ? S.idx - 1 : 86 }), nextPhoto: () => this.setState({ idx: S.idx < 86 ? S.idx + 1 : 1 }),
      goBack: () => this.ptoast('Would go back to Fremantle Markets'), findSimilar: () => this.ptoast('Would show 38 similar photos in Library'),
      pToast: S.ptext, pToastOp: S.pt ? 1 : 0,
      moreOpen: S.more, toggleMore: () => this.setState({ more: !S.more }), moreFg: S.more ? '#efede8' : '#a8a59f', moreBg: S.more ? 'rgba(255,255,255,.08)' : 'transparent',
      moreItems: [
        { label: inPf ? 'In portfolio ✓' : 'Add to portfolio', meta: '', sep: 'none', fg: '#efede8', go: () => { this.setState({ inPf: !inPf, more: false }); this.ptoast(inPf ? 'Removed from portfolio' : 'Added to portfolio'); } },
        { label: fav ? '★ Favourite' : '☆ Favourite', meta: 'F', sep: 'none', fg: '#efede8', go: () => { this.setState({ fav: !fav, more: false }); this.ptoast(fav ? 'Removed from favourites' : 'Added to portfolio favourites'); } },
        { label: 'Download original', meta: '24 MB', sep: 'block', fg: '#efede8', go: close('Downloading DSCF4182.RAF') },
        { label: 'Export XMP', meta: '', sep: 'none', fg: '#efede8', go: close('XMP sidecar written') },
        { label: 'Review again', meta: '', sep: 'block', fg: '#efede8', go: close('Added back to the review queue') },
        { label: 'Leave out of review', meta: '', sep: 'none', fg: '#efede8', go: close('Won’t come back for review') },
        { label: 'Delete photo…', meta: '', sep: 'block', fg: 'oklch(0.75 0.14 28)', go: () => this.setState({ more: false, del: true }) },
      ],
      pickerOpen: S.picker, openPicker: () => this.setState({ picker: true, more: false }), closePicker: () => this.setState({ picker: false, pickQ: '' }),
      pickQ: S.pickQ, onPickQ: (e) => this.setState({ pickQ: e.target.value }),
      pickRows: [...ins.map((r, i) => mkRow(r, i, 'Already in · ' + S.inSet.length)), ...outs.map((r, i) => mkRow(r, i, 'Recently edited'))],
      pickFoot: q ? (pool.length ? '' : 'No composition called “' + S.pickQ.trim() + '”.') : '57 more · type to find them. Printed compositions are hidden.',
      newComp: () => { this.setState({ picker: false }); this.ptoast('Would start a new composition with this photo'); },
      addLabel: S.inSet.length ? 'In ' + S.inSet.length + ' · Add to composition' : 'Add to composition',
    };
  }
  detVals() {
    const D = this.state.det; const F = [['camera', 'Camera', 'Camera'], ['lens', 'Lens', 'Lens'], ['ap', 'Aperture', 'f/–'], ['place', 'Place', 'Place']];
    return { detailFields: F.map(([k, title, ph], i) => ({ value: D[k], title: title + ' · click to edit', ph, sepShow: i ? 'inline' : 'none', size: Math.max(3, (D[k] || ph).length), onChange: (e) => this.setState((s) => ({ det: { ...s.det, [k]: e.target.value } })) })) };
  }
  aiVals() {
    const S = this.state; const busy = S.ai === 'busy'; const done = S.ai === 'done';
    const sug = ['golden hour', 'streetwear', 'sunglasses', 'warm tones'];
    return {
      aiLabel: busy ? 'Analyzing…' : done ? '✓ Analyzed · run again' : '✦ Analyze with AI', aiFg: busy ? '#a8a59f' : '#efede8', aiCursor: busy ? 'default' : 'pointer',
      aiSpinner: busy ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
      runAi: () => { if (busy) return; this.setState({ ai: 'busy', acc: [] }); clearTimeout(this.aiT); this.aiT = setTimeout(() => this.setState({ ai: 'done' }), 2400); },
      aiTags: done ? sug.map((g) => { const on = S.acc.includes(g); return { label: g, mark: on ? '✓' : '+', fg: on ? '#efede8' : '#a8a59f', bg: on ? 'rgba(255,255,255,.08)' : 'transparent', ring: on ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.22)', accept: () => this.setState({ acc: on ? S.acc.filter((x) => x !== g) : [...S.acc, g] }) }; }) : [],
      descText: busy ? 'Writing a description…' : done ? 'Man in a mint shirt leaning on a stone wall at golden hour' : 'Not written yet', descFg: done ? '#a8a59f' : '#6f6c67',
    };
  }
  rateVals() {
    const S = this.state; const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const you = S.mine ? (4.3 * 3 + S.mine) / 4 : 4.3; const score = (you * 0.65 + 4.5 * 0.35);
    const fmt = (n) => n.toFixed(1);
    return {
      rateOpen: S.rateOpen, rated: !!S.mine, notRated: !S.mine, note: S.note,
      you: fmt(you), score: fmt(score),
      rateBtnLabel: S.mine ? 'Rated ' + R[S.mine - 1][0] : 'Rate now', rateBtnBg: 'transparent',
      rateTitle: S.mine ? 'Rated ' + R[S.mine - 1][1] : 'How does it hold up?', rateSub: 'Session 4 of 4',
      rateResult: S.mine ? `Your score 4.3 → ${fmt(you)} · combined ${fmt(score)}. That was its last session, so the 2 Feb review is cancelled.` : '',
      rateOpts: R.map(([emoji, label], i) => ({ emoji, label, key: String(i + 1), bg: S.mine === i + 1 ? 'rgba(255,255,255,.12)' : 'transparent', fg: S.mine === i + 1 ? '#efede8' : '#a8a59f', op: S.mine && S.mine !== i + 1 ? 0.45 : 1, pick: () => this.setState({ mine: i + 1 }) })),
      toggleRate: () => this.setState({ rateOpen: !S.rateOpen }), stop: (e) => e.stopPropagation(), undoRate: () => this.setState({ mine: null, note: '' }), doneRate: () => this.setState({ rateOpen: false }),
      onNote: (e) => this.setState({ note: e.target.value }),
    };
  }
  renderVals() {
    const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const mates = [3, 6, 7, 0, 8, 5, 9, 4, 1, 2, 6, 3, 0, 8].map((n, i) => ({ src: `photos/p${n + 1}.jpg`, ar: AR[n], op: i === 2 ? 1 : 0.45 }));
    const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const ratings = R.map(([emoji, label], i) => ({ emoji, label, value: i + 1, size: i === 3 ? '50px' : '38px', op: i === 3 ? 1 : 0.45, col: i === 3 ? '#efede8' : '#6f6c67' }));
    const ratingsAfter = R.map(([emoji, label], i) => ({ emoji, label, value: i + 1, bg: i === 3 ? 'rgba(255,255,255,.1)' : 'transparent', col: i === 3 ? '#efede8' : '#a8a59f' }));
    const progress = Array.from({ length: 12 }, (_, i) => (i < 3 ? '#efede8' : i === 3 ? '#8f8c86' : 'rgba(255,255,255,.12)'));
    const names = ['Kitchen wall', 'Hallway triptych', 'Studio feature', 'Mum’s birthday', 'Portraits 2026', 'Blue hour', 'Cars & chrome', 'Rottnest set', 'Office A2', 'Autumn hallway', 'Margaret River trio', 'Roll 41 picks', 'Bedroom pair', 'Studio · Ana', 'Grid of 9'];
    const inSet = new Set([0, 2, 4]);
    const allComps = names.map((name, i) => ({ name, state: inSet.has(i) ? (i === 0 ? 'Chosen for print 2 of 3' : 'Candidate · 24 candidates') : `${(i % 3) + 1} × A${3 + (i % 2)} · ${12 + i * 3} candidates`, btn: inSet.has(i) ? 'Added ✓' : 'Add', btnBg: inSet.has(i) ? '#efede8' : 'transparent', btnFg: inSet.has(i) ? '#0d0d0d' : '#efede8' }));
    const inComps = [{ name: 'Kitchen wall', state: 'Print 2 · A3' }, { name: 'Portraits 2026', state: 'Candidate' }, { name: 'Studio feature', state: 'Candidate' }];
    const recentComps = [{ name: 'Hallway triptych', state: 'yesterday', hover: 'rgba(255,255,255,.06)' }, { name: 'Mum’s birthday', state: 'last week', hover: 'transparent' }, { name: 'Blue hour', state: '2 weeks ago', hover: 'transparent' }, { name: 'Cars & chrome', state: 'Oct 2026', hover: 'transparent' }];
    return {
      rPickOpen: !!this.state.rPick, openRPick: () => this.setState({ rPick: true }), closeRPick: () => this.setState({ rPick: false }), rPickThumbs: ['photos/p5.jpg'], rPickDone: (sel, msg) => this.rflash(msg), rToast: this.state.rToast || '', rToastOp: this.state.rtOp ? 1 : 0,
      quickAdd: () => this.rflash('Added to Kitchen wall as a candidate'), mates, ratings, ratingsAfter, progress, allComps, inComps, recentComps, ...this.rateVals(), ...this.aiVals(), ...this.detVals(), ...this.barVals(), ...this.revVals(), ...this.delVals() };
  }
}
