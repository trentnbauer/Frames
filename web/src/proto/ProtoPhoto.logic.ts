/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Photo.dc.html. Behaviour is the spec; the photograph, its data and every action come in
// through props (see screens/Photo.tsx). Place search and reverse lookup go through this server's map proxy.
import React from 'react';
import { DCLogic } from './runtime';
import { addShortcuts } from '../components/shortcuts';

const spin = () => React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--outline)', borderTopColor: 'var(--text)', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } });
const ICON = { business: 'BU', suburb: 'SU', city: 'CI', landmark: 'LM', place: 'PL' };

export class Logic extends DCLogic {
  state = { more: false, del: false, delMode: 'frames', pick: false, rateOpen: false, mine: null, note: '', map: null, toast: '', tOp: 0, newTag: '' };
  componentDidMount() { this.offKeys = addShortcuts(() => [
    { key: 'ArrowLeft', label: 'Previous photo', run: () => this.props.onStep(-1) },
    { key: 'ArrowRight', label: 'Next photo', run: () => this.props.onStep(1) },
  ]); }
  componentWillUnmount() { this.offKeys?.(); clearTimeout(this.tT); clearTimeout(this.mT); }
  ptoast(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2400); }

  openMap() { this.setState({ map: true }); }
  renderVals() {
    const S = this.state, P = this.props;
    const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const mode = S.delMode;
    const pl = P.place || {};
    const aiBusy = !!P.aiBusy, aiDone = !!P.aiDone;
    const closeAnd = (fn, t) => async () => { this.setState({ more: false }); if (fn) await fn(); if (t) this.ptoast(t); };
    return {
      photoSrc: P.photoSrc, photoIdx: P.idx, photoTotal: P.total, shootName: P.shootName, goBack: P.onBack, findSimilar: P.onFindSimilar,
      prevPhoto: () => P.onStep(-1), nextPhoto: () => P.onStep(1), pToast: S.toast, pToastOp: S.tOp,
      mates: (P.mates || []).map((m) => ({ src: m.src, ar: m.ar, op: m.current ? 1 : 0.45, go: () => P.onOpenMate(m.id) })),
      pfTitle: P.pfTitle, pfLabel: P.pfLabel, pfDotBg: P.pfOn ? 'var(--text)' : 'transparent', pfDotRing: P.pfOn ? 'none' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 35%, transparent)', togglePf: () => P.onTogglePf(),
      favLabel: P.fav ? '★ Favourite' : '☆ Favourite', favFg: P.fav ? 'var(--text)' : 'var(--text2)', toggleFav: () => P.onToggleFav(),
      aiLabel: aiBusy ? 'Analyzing…' : aiDone ? '✓ Analyzed · run again' : '✦ Analyze with AI', aiFg: aiBusy ? 'var(--text2)' : 'var(--text)', aiCursor: aiBusy ? 'default' : 'pointer', aiSpinner: aiBusy ? spin() : null,
      runAi: async () => { if (aiBusy) return; const m = await P.onRunAi(); if (m) this.ptoast(m); },
      moreOpen: S.more, toggleMore: () => this.setState({ more: !S.more }), moreFg: S.more ? 'var(--text)' : 'var(--text2)', moreBg: S.more ? 'var(--hair)' : 'transparent',
      moreItems: (P.moreItems || []).map((m) => ({ label: m.label, meta: m.meta || '', sep: m.sep ? 'block' : 'none', fg: m.danger ? 'oklch(0.75 0.14 28)' : 'var(--text)', go: m.danger ? () => this.setState({ more: false, del: true }) : closeAnd(m.run, m.toast) })),
      addLabel: P.inComps.length ? 'In ' + P.inComps.length + ' · Add to composition' : 'Add to composition', openPicker: () => this.setState({ pick: true, more: false }),
      pickerOpen: S.pick, compPicker: S.pick ? P.renderCompPicker(() => this.setState({ pick: false }), (m) => { this.setState({ pick: false }); this.ptoast(m); }) : null,
      titleVal: P.title, titlePh: aiBusy ? 'Naming it…' : 'Untitled', onTitle: (e) => P.onTitle(e.target.value), titleBg: 'transparent',
      dateVal: P.dateVal, dateTitle: P.dateTitle, onDate: (e) => P.onDate(e.target.value), dateSrc: P.dateSrc, dateEdited: P.dateEdited, resetDate: () => P.onResetDate(),
      season: P.season, seasonDot: P.seasonDot, seasonTitle: P.seasonTitle,
      palette: P.palette || [], paletteNames: P.paletteNames || '',
      score: P.score, you: P.you, guests: P.guests, rankLine: P.rankLine, nextDue: P.nextDue,
      rateOpen: S.rateOpen, rated: !!S.mine, notRated: !S.mine, note: S.note,
      rateBtnLabel: S.mine ? 'Rated ' + R[S.mine - 1][0] : 'Rate now', rateBtnBg: 'transparent',
      rateTitle: S.mine ? 'Rated ' + R[S.mine - 1][1] : 'How does it hold up?', rateSub: P.rateSub || '',
      rateResult: S.mine ? P.rateResult(S.mine) : '',
      rateOpts: R.map(([emoji, label], i) => ({ emoji, label, key: String(i + 1), bg: S.mine === i + 1 ? 'color-mix(in srgb, var(--text) 12%, transparent)' : 'transparent', fg: S.mine === i + 1 ? 'var(--text)' : 'var(--text2)', op: S.mine && S.mine !== i + 1 ? 0.45 : 1, pick: async () => { this.setState({ mine: i + 1 }); await P.onRate(i + 1, S.note); } })),
      toggleRate: () => this.setState({ rateOpen: !S.rateOpen }), stop: (e) => e.stopPropagation(), undoRate: () => this.setState({ mine: null, note: '' }), doneRate: () => { if (S.mine && S.note) P.onRate(S.mine, S.note); this.setState({ rateOpen: false }); },
      onNote: (e) => this.setState({ note: e.target.value }),
      printLine: P.printLine, printSub: P.printSub,
      placeLabel: pl.name || 'Add a place', placeFg: pl.name ? 'var(--text)' : 'var(--muted)',
      sens: (P.sensitive || []).map((k) => ({ label: (k.on ? '⚠ ' : '') + k.name, bg: k.on ? 'oklch(0.62 0.17 28 / .22)' : 'transparent', fg: k.on ? 'oklch(0.85 0.1 28)' : 'var(--muted)', ring: k.on ? 'inset 0 0 0 1px oklch(0.62 0.17 28 / .6)' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 16%, transparent)', go: async () => { await P.onSensitive(k.name, !k.on); this.ptoast(!k.on ? 'Marked ' + k.name.toLowerCase() + ' · hidden from community review' : 'Mark removed'); } })),
      tags: P.tags || [], aiTags: aiDone || (P.aiTags || []).length ? (P.aiTags || []) : [], newTag: S.newTag, onNewTag: (e) => this.setState({ newTag: e.target.value }),
      onNewTagKey: async (e) => { if (e.key === 'Enter' && S.newTag.trim()) { await P.onAddTag(S.newTag.trim()); this.setState({ newTag: '' }); } },
      descText: aiBusy ? 'Writing a description…' : P.description || 'Not written yet', descFg: P.description ? 'var(--text2)' : 'var(--faint)',
      detailFields: (P.detailFields || []).map((d, i) => ({ ...d, sepShow: i ? 'inline' : 'none' })),
      inComps: P.inComps, inCompsTitle: P.inComps.length === 1 ? 'In 1 composition' : P.inComps.length ? 'In ' + P.inComps.length + ' compositions' : 'In no composition',
      delOpen: S.del, closeDel: () => this.setState({ del: false }),
      delOpts: [['frames', 'Remove from Frames', 'The original stays on disk. You can import it again later.'], ['trash', 'Also move the original to the trash', P.trashHint]].map(([k, label, hint]) => ({ label, hint, bg: mode === k ? 'var(--hover)' : 'transparent', ring: mode === k ? 'inset 0 0 0 1px color-mix(in srgb, var(--text) 16%, transparent)' : 'none', dot: mode === k ? 'inset 0 0 0 5px var(--text)' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 35%, transparent)', pick: () => this.setState({ delMode: k }) })),
      delLabel: mode === 'trash' ? 'Delete and trash file' : 'Delete photo', delSub: P.delSub, delWarn: P.delWarn,
      confirmDel: async () => { this.setState({ del: false }); await P.onDelete(mode); },
      mapToast: (t) => this.ptoast(t), mapOpen: !!S.map, openMap: () => this.openMap(), closeMap: () => this.setState({ map: null }),
    };
  }
}
