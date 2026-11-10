/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Compositions.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { framed: true, colour: 'Black', width: 'A2', mat: 'White', sizeMenu: false };
  frameVals() {
    const S = this.state;
    const C = [['Black', '#151514'], ['White', '#e9e7e1'], ['Oak', '#b08a5e'], ['Walnut', '#5b3f2c'], ['Silver', '#a3a3a0']];
    const seg = (opts, key) => opts.map((x) => ({ label: x, bg: S[key] === x ? '#efede8' : 'transparent', fg: S[key] === x ? '#0d0d0d' : '#a8a59f', pick: () => this.setState({ [key]: x }) }));
    return {
      framed: S.framed, unframed: !S.framed, frameLabel: S.framed ? 'Framed' : 'No frame',
      frameTrack: S.framed ? '#efede8' : 'rgba(255,255,255,.14)', frameKnob: S.framed ? '21px' : '3px', frameKnobBg: S.framed ? '#0d0d0d' : '#a8a59f',
      toggleFrame: () => this.setState({ framed: !S.framed }),
      frameColours: C.map(([name, bg]) => ({ name, bg, ring: S.colour === name ? '0 0 0 2px #161615,0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.12)', pick: () => this.setState({ colour: name }) })),
      frameSize: S.width, sizeMenuOpen: S.sizeMenu, toggleSizeMenu: () => this.setState({ sizeMenu: !S.sizeMenu }),
      sizeGroups: [['ISO paper', ['A5', 'A4', 'A3', 'A2', 'A1']], ['Photo & poster', ['5×7″', '8×10″', '11×14″', '16×20″', '50×70']]].map(([name, sizes]) => ({ name, sizes: sizes.map((x) => { const small = ['A5', 'A4', '5×7″', '8×10″', '11×14″'].includes(x); const exact = x === 'A3'; return { label: x, note: x === S.width ? '✓' : small ? 'too small' : exact && S.mat !== 'None' ? 'no mat' : '', fg: small ? '#6f6c67' : '#efede8', bg: x === S.width ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => { if (!small) this.setState({ width: x, sizeMenu: false, mat: exact ? 'None' : S.mat }); } }; }) })), mats: seg(['None', 'White', 'Ivory', 'Black'], 'mat'),
      frameSummary: S.mat === 'None' ? `${S.colour} ${S.width} frame, no mat · print fills the frame` : `${S.colour} ${S.width} frame, ${S.mat.toLowerCase()} mat around the A3 print`,
    };
  }
  renderVals() {
    const p = (n) => `photos/p${n}.jpg`;
    const list = [['Kitchen wall', '3 × A3', '2 of 3 chosen · 24 candidates', 7, 4, 1], ['Hallway triptych', '3 × A4', '2 of 3 chosen · 41 candidates', 1, 2, 3], ['Studio feature', 'A2 + 2 × A5', '1 of 3 chosen · 17 candidates', 8, 9, 6], ['Cars & chrome', '2 × 50×70', '1 of 2 chosen · 12 candidates', 5, 10, 4], ['Portraits 2026', '4 × A4', '3 of 4 chosen · 58 candidates', 6, 7, 8], ['Green & gold', 'A2', '0 of 1 chosen · 9 candidates', 3, 2, 1]];
    const comps = list.map(([name, prints, status, a, b, c]) => ({ name, prints, status, a: p(a), b: p(b), c: p(c) }));
    const pcts = ['67%', '67%', '33%', '50%', '75%', '0%', '100%', '100%', '0%'];
    const sts = ['2 of 3 chosen', '2 of 3 chosen', '1 of 3 chosen', '1 of 2 chosen', '3 of 4 chosen', 'Not started', 'Ready to export', 'Ready to export', 'Not started'];
    const compsAfter = [...list, ['Mum’s birthday', '50×70', '', 9, 8, 6], ['Bedroom pair', '2 × A3', '', 2, 3, 1], ['Office A2', 'A2 · oak', '', 9, 1, 2]].map(([name, prints, , a, b, c], i) => ({ name, prints, status: sts[i], pct: pcts[i], a: p(a), b: p(b), cBg: `url(${p(c)}) center/cover` }));
    const K = 1.85; const pr = (w, h, n, frame = '#151514', mat = '#f4f2ec', matPad = '6px') => ({ w: Math.round(w * K) + 'px', h: Math.round(h * K) + 'px', frame, mat, matPad: Math.round(parseInt(matPad) * K) + 'px', img: n ? `url(${p(n)}) center/cover` : 'rgba(0,0,0,.18)', empty: n ? 'none' : 'inset 0 0 0 1px rgba(239,237,232,.6)' });
    const walls = [
      { gap: '10px', wall: [pr(50, 70, 7), pr(50, 70, 4), pr(50, 70, null)] },
      { gap: '8px', wall: [pr(42, 60, 1, '#b08a5e'), pr(42, 60, 2, '#b08a5e'), pr(42, 60, null, '#b08a5e')] },
      { gap: '8px', wall: [pr(86, 62, 9, '#e9e7e1'), pr(32, 46, null, '#e9e7e1'), pr(32, 46, null, '#e9e7e1')] },
      { gap: '12px', wall: [pr(80, 56, 5, '#a3a3a0', '#1a1a19'), pr(80, 56, null, '#a3a3a0', '#1a1a19')] },
      { gap: '6px', wall: [pr(44, 44, 6, '#151514', '#f4f2ec', '4px'), pr(44, 44, 7, '#151514', '#f4f2ec', '4px'), pr(44, 44, 8, '#151514', '#f4f2ec', '4px'), pr(44, 44, null, '#151514', '#f4f2ec', '4px')] },
      { gap: '0', wall: [pr(70, 98, null, '#5b3f2c', '#e6dfcc', '10px')] },
      { gap: '0', wall: [pr(66, 92, 8, '#5b3f2c', '#e6dfcc', '10px')] },
      { gap: '12px', wall: [pr(54, 76, 2, '#e9e7e1'), pr(54, 76, 3, '#e9e7e1')] },
      { gap: '0', wall: [pr(112, 76, 9, '#b08a5e', '#f4f2ec', '8px')] },
    ];
    walls.forEach((w) => { w.gap = Math.round(parseInt(w.gap) * K) + 'px'; });
    compsAfter.forEach((c, i) => Object.assign(c, walls[i]));
    const cand = [[7, 4.6, '4.6', '4.7', '100%', 'inset 0 0 0 1px #efede8'], [4, 4.5, '4.4', '4.6', '90%', 'inset 0 0 0 1px #efede8'], [8, 4.2, '4.3', '4.0', '84%', 'none'], [6, 4.0, '4.1', '3.8', '80%', 'none']];
    const cands = cand.map(([n, score, you, guests, pct, ring], i) => ({ src: p(n), score: score.toFixed(1), you, guests, pct, ring, rank: i + 1 }));
    const ca = [[7, '4.6', 'Print 1', '#efede8', '#0d0d0d', 'inset 0 0 0 1px #efede8'], [4, '4.5', 'Print 2', '#efede8', '#0d0d0d', 'inset 0 0 0 1px #efede8'], [8, '4.2', 'Fits', 'rgba(0,0,0,.62)', '#efede8', 'none'], [6, '4.0', 'Fits', 'rgba(0,0,0,.62)', '#efede8', 'none'], [9, '3.9', 'Fits', 'rgba(0,0,0,.62)', '#efede8', 'none'], [5, '3.7', 'Too small', 'rgba(0,0,0,.62)', 'oklch(0.78 0.11 35)', 'none']];
    const candsAfter = ca.map(([n, score, tag, tagBg, tagFg, ring], i) => ({ src: p(n), score, tag, tagBg, tagFg, ring, rank: i + 1 }));
    const S = this.state; const tab = S.tab || 'prog'; const moved = S.moved || [];
    const flash = (t) => { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 1800); };
    const W = (ws) => { const o = { ...ws }; o.gap = o.gap; return o; };
    const READY = [[6, 'Mum’s birthday', 'Finished last week', [['Prints', '1 × 50×70 · portrait', ''], ['Frames', '1 × walnut 50×70 · ivory mat', ''], ['Photo', 'Behind the lens · 6000 × 4000', '✓ 300 PPI'], ['Export', '1 original · 48 MB · print notes', '']]], [7, 'Bedroom pair', 'Finished 3 days ago', [['Prints', '2 × A3 · portrait', ''], ['Frames', '1 × white A3 · no mat, 1 × oak A2 · white mat', ''], ['Photos', 'Fern gully, Into the ferns', '✓ 300 PPI'], ['Export', '2 originals · 61 MB · print notes', '']]]];
    const ready = READY.filter(([i]) => !moved.includes(i)).map(([i, name, when, rows]) => ({ ...walls[i], name, when, rows: rows.map(([k, v, ok]) => ({ k, v, ok })), exportLabel: (S.exp || {})[i] ? '✓ Exported · again' : 'Export originals', export: () => { this.setState((s) => ({ exp: { ...(s.exp || {}), [i]: true } })); flash('Exporting ' + name + ' · zip with print notes'); }, sheet: () => flash('Downloading ' + name + ' print sheet.pdf'), printed: () => { this.setState((s) => ({ moved: [...(s.moved || []), i] })); flash(name + ' moved to Printed'); } }));
    const pr2 = (w, h, n, frame, mat = '#f4f2ec', matPad = 6) => ({ w: Math.round(w * 1.1) + 'px', h: Math.round(h * 1.1) + 'px', frame, mat, matPad: matPad + 'px', img: `url(${p(n)}) center/cover`, empty: 'none' });
    const PR = [['Office A2', 'A2 · oak', 'Study', '12 Oct 2026', 'Fitzroy Print Lab', '$184', { gap: '0', wall: [pr2(112, 76, 9, '#b08a5e', '#f4f2ec', 8)] }], ['Hallway trio, 2025', '3 × A4 · black', 'Hallway', '28 Aug 2026', 'Printroom Perth', '$156', { gap: '8px', wall: [pr2(40, 56, 1, '#151514'), pr2(40, 56, 2, '#151514'), pr2(40, 56, 3, '#151514')] }], ['Rottnest pair', '2 × 50×70 · white', 'Living room', '2 Jul 2026', 'Fitzroy Print Lab', '$298', { gap: '10px', wall: [pr2(48, 68, 9, '#e9e7e1'), pr2(48, 68, 6, '#e9e7e1')] }], ['Dad’s 60th', 'A2 · walnut', 'Gift', '14 May 2026', 'Printroom Perth', '$142', { gap: '0', wall: [pr2(60, 84, 8, '#5b3f2c', '#e6dfcc', 8)] }], ['Studio grid', '4 × A4 · black', 'Studio', '3 Mar 2026', 'Momento Pro', '$212', { gap: '5px', wall: [pr2(34, 34, 6, '#151514'), pr2(34, 34, 7, '#151514'), pr2(34, 34, 4, '#151514'), pr2(34, 34, 10, '#151514')] }], ['Margaret River', '3 × A3 · oak', 'Kitchen', '20 Jan 2026', 'Fitzroy Print Lab', '$228', { gap: '8px', wall: [pr2(40, 56, 1, '#b08a5e'), pr2(40, 56, 4, '#b08a5e'), pr2(40, 56, 7, '#b08a5e')] }]];
    const extra = READY.filter(([i]) => moved.includes(i)).map(([i, name]) => ({ ...walls[i], name, prints: i === 6 ? '50×70 · walnut' : '2 × A3 · white', where: 'Not hung yet', date: 'Today', lab: '—', cost: '—', again: () => flash('Would reorder ' + name) }));
    const printed = [...extra, ...PR.map(([name, prints, where, date, lab, cost, wl]) => ({ ...wl, name, prints, where, date, lab, cost, again: () => flash('Reorder sent to ' + lab + ' · same sizes and frames') }))];
    return {
      comps, cands, candsAfter, ...this.frameVals(),
      compsAfter: compsAfter.filter((c, i) => i !== 6 && i !== 7),
      tabs: [['prog', 'In progress', 11 - 0], ['ready', 'Ready to export', ready.length], ['printed', 'Printed', 51 + extra.length]].map(([k, label, n]) => ({ label, n, bg: tab === k ? 'rgba(255,255,255,.1)' : 'transparent', fg: tab === k ? '#efede8' : '#a8a59f', go: () => this.setState({ tab: k }) })),
      sortLabel: tab === 'printed' ? 'Newest printed' : 'Last edited',
      isProg: tab === 'prog', isReady: tab === 'ready', isPrinted: tab === 'printed', ready, readyEmpty: !ready.length, printed,
      pStats: [['51', 'compositions printed'], ['138', 'prints'], ['112', 'frames'], ['4', 'labs used']].map(([v, l]) => ({ v, l })),
      printedMore: 'Showing ' + printed.length + ' of ' + (51 + extra.length) + ' · Load more',
      toast: S.toast || '', toastOp: S.tOp || 0,
    };
  }
}
