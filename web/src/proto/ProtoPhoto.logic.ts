/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Photo.dc.html. Behaviour is the spec; the photograph, its data and every action come in
// through props (see screens/Photo.tsx). Place search and reverse lookup go through this server's map proxy.
import React from 'react';
import { DCLogic } from './runtime';

const spin = () => React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } });
const ICON = { business: 'BU', suburb: 'SU', city: 'CI', landmark: 'LM', place: 'PL' };

export class Logic extends DCLogic {
  state = { more: false, del: false, delMode: 'frames', pick: false, rateOpen: false, mine: null, note: '', map: null, toast: '', tOp: 0, newTag: '' };
  componentWillUnmount() { clearTimeout(this.tT); clearTimeout(this.mT); }
  ptoast(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2400); }

  // The place picker: a search box, a list of places, a map you can click, and how much the public may see.
  openMap() {
    const pl = this.props.place || {};
    const lat = pl.lat ?? this.props.defaultLat ?? -32.0569, lng = pl.lng ?? this.props.defaultLng ?? 115.7439;
    this.setState({ map: { q: '', name: pl.name || '', address: pl.address || '', kind: pl.kind || '', suburb: pl.suburb || '', city: pl.city || '', lat, lng, prec: pl.precision || 'exact', picked: pl.name || null, results: [], busy: false, err: '', has: pl.lat != null } });
    if (pl.lat != null && !pl.name) this.reverse(lat, lng);
  }
  setMap(p) { this.setState((s) => ({ map: s.map ? { ...s.map, ...p } : s.map })); }
  async search(q) {
    if (!q.trim()) { this.setMap({ results: [], busy: false, err: '' }); return; }
    this.setMap({ busy: true, err: '' });
    try { const r = await this.props.searchPlaces(q); if (this.state.map && this.state.map.q === q) this.setMap({ results: r, busy: false }); } catch (e) { this.setMap({ busy: false, results: [], err: e.message || 'Search is not available right now' }); }
  }
  async reverse(lat, lng) {
    try { const r = await this.props.reversePlace(lat, lng); if (this.state.map) this.setMap({ name: r.name, address: r.address, kind: r.kind, suburb: r.suburb, city: r.city, picked: null }); } catch { /* keeps the pin and "Dropped pin" */ }
  }
  mapVals() {
    const S = this.state, P = this.props; const M = S.map;
    if (!M) return { mapOpen: false, openMap: () => this.openMap() };
    const Z = 15, TS = 256, W = 552, H = 280, N = TS * Math.pow(2, Z);
    const toPx = (lat, lng) => { const r = lat * Math.PI / 180; return [(lng + 180) / 360 * N, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N]; };
    const toLL = (x, y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI, x / N * 360 - 180];
    const [cx, cy] = toPx(M.lat, M.lng); const x0 = cx - W / 2, y0 = cy - H / 2; const tiles = [];
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x0 + W) / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y0 + H) / TS); ty++) tiles.push({ src: '/api/map/tile/' + Z + '/' + tx + '/' + ty, left: Math.round(tx * TS - x0) + 'px', top: Math.round(ty * TS - y0) + 'px' });
    const q = M.q.trim();
    const near = M.name ? [{ name: M.name, address: M.address, kind: M.kind || 'place', lat: M.lat, lon: M.lng, suburb: M.suburb, city: M.city }] : [];
    const list = q ? M.results : near;
    const pick = (p) => this.setMap({ name: p.name, address: p.address, kind: p.kind, suburb: p.suburb, city: p.city, lat: p.lat, lng: p.lon, picked: p.name, q: '', results: [], prec: p.kind === 'city' ? 'city' : p.kind === 'suburb' ? 'suburb' : M.prec });
    const shown = !M.name ? '' : M.prec === 'exact' ? M.name : M.prec === 'suburb' ? (M.suburb || M.city || M.name) : (M.city || M.suburb || M.name);
    const cap = (k) => k[0].toUpperCase() + k.slice(1);
    return {
      mapOpen: true, closeMap: () => this.setState({ map: null }), mapQ: M.q,
      onMapQ: (e) => { const v = e.target.value; this.setMap({ q: v }); clearTimeout(this.mT); this.mT = setTimeout(() => this.search(v), 900); },
      mapKey: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (list[0] && q && !M.busy) pick(list[0]); else if (q) { clearTimeout(this.mT); this.search(q); } } if (e.key === 'Escape') this.setState({ map: null }); },
      mapListTitle: q ? (M.busy ? 'Searching…' : list.length + (list.length === 1 ? ' place' : ' places')) : 'Near the pin', mapNone: !!q && !M.busy && !list.length,
      mapResults: list.map((p) => ({ name: p.name, sub: p.address, kind: cap(p.kind || 'place'), icon: ICON[p.kind] || 'PL', bg: M.picked === p.name ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => pick(p) })),
      mapTiles: tiles, mapCoords: M.lat.toFixed(4) + ', ' + M.lng.toFixed(4),
      mapClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); const k = r.width / W; const [lat, lng] = toLL(cx + ((e.clientX - r.left) / k - W / 2), cy + ((e.clientY - r.top) / k - H / 2)); this.setMap({ lat, lng, name: M.name || 'Dropped pin', address: '', picked: null }); this.reverse(lat, lng); },
      mapPrec: [['exact', 'Exact'], ['suburb', 'Suburb'], ['city', 'City']].map(([k, label]) => ({ label, bg: M.prec === k ? '#efede8' : 'transparent', fg: M.prec === k ? '#0d0d0d' : '#a8a59f', pick: () => this.setMap({ prec: k }) })),
      mapSummary: M.name ? M.name + (M.picked ? '' : ' · pin moved') + ' · shows as “' + shown + '”' : 'No place yet', mapHasPlace: !!(P.place && P.place.name),
      mapRemove: async () => { this.setState({ map: null }); await P.onRemovePlace(); this.ptoast('Place removed'); },
      mapSave: async () => { if (!M.name) return; this.setState({ map: null }); await P.onSavePlace({ name: M.name, address: M.address, kind: M.kind, suburb: M.suburb, city: M.city, lat: M.lat, lng: M.lng, precision: M.prec }); this.ptoast('Place saved · ' + M.name); },
      openMap: () => this.openMap(),
    };
  }

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
      pfTitle: P.pfTitle, pfLabel: P.pfLabel, pfDotBg: P.pfOn ? '#efede8' : 'transparent', pfDotRing: P.pfOn ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', togglePf: () => P.onTogglePf(),
      favLabel: P.fav ? '★ Favourite' : '☆ Favourite', favFg: P.fav ? '#efede8' : '#a8a59f', toggleFav: () => P.onToggleFav(),
      aiLabel: aiBusy ? 'Analyzing…' : aiDone ? '✓ Analyzed · run again' : '✦ Analyze with AI', aiFg: aiBusy ? '#a8a59f' : '#efede8', aiCursor: aiBusy ? 'default' : 'pointer', aiSpinner: aiBusy ? spin() : null,
      runAi: async () => { if (aiBusy) return; const m = await P.onRunAi(); if (m) this.ptoast(m); },
      moreOpen: S.more, toggleMore: () => this.setState({ more: !S.more }), moreFg: S.more ? '#efede8' : '#a8a59f', moreBg: S.more ? 'rgba(255,255,255,.08)' : 'transparent',
      moreItems: (P.moreItems || []).map((m) => ({ label: m.label, meta: m.meta || '', sep: m.sep ? 'block' : 'none', fg: m.danger ? 'oklch(0.75 0.14 28)' : '#efede8', go: m.danger ? () => this.setState({ more: false, del: true }) : closeAnd(m.run, m.toast) })),
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
      rateOpts: R.map(([emoji, label], i) => ({ emoji, label, key: String(i + 1), bg: S.mine === i + 1 ? 'rgba(255,255,255,.12)' : 'transparent', fg: S.mine === i + 1 ? '#efede8' : '#a8a59f', op: S.mine && S.mine !== i + 1 ? 0.45 : 1, pick: async () => { this.setState({ mine: i + 1 }); await P.onRate(i + 1, S.note); } })),
      toggleRate: () => this.setState({ rateOpen: !S.rateOpen }), stop: (e) => e.stopPropagation(), undoRate: () => this.setState({ mine: null, note: '' }), doneRate: () => { if (S.mine && S.note) P.onRate(S.mine, S.note); this.setState({ rateOpen: false }); },
      onNote: (e) => this.setState({ note: e.target.value }),
      printLine: P.printLine, printSub: P.printSub,
      placeLabel: pl.name || 'Add a place', placeFg: pl.name ? '#efede8' : '#8f8c86',
      sens: (P.sensitive || []).map((k) => ({ label: (k.on ? '⚠ ' : '') + k.name, bg: k.on ? 'oklch(0.62 0.17 28 / .22)' : 'transparent', fg: k.on ? 'oklch(0.85 0.1 28)' : '#8f8c86', ring: k.on ? 'inset 0 0 0 1px oklch(0.62 0.17 28 / .6)' : 'inset 0 0 0 1px rgba(255,255,255,.16)', go: async () => { await P.onSensitive(k.name, !k.on); this.ptoast(!k.on ? 'Marked ' + k.name.toLowerCase() + ' · hidden from community review' : 'Mark removed'); } })),
      tags: P.tags || [], aiTags: aiDone || (P.aiTags || []).length ? (P.aiTags || []) : [], newTag: S.newTag, onNewTag: (e) => this.setState({ newTag: e.target.value }),
      onNewTagKey: async (e) => { if (e.key === 'Enter' && S.newTag.trim()) { await P.onAddTag(S.newTag.trim()); this.setState({ newTag: '' }); } },
      descText: aiBusy ? 'Writing a description…' : P.description || 'Not written yet', descFg: P.description ? '#a8a59f' : '#6f6c67',
      detailFields: (P.detailFields || []).map((d, i) => ({ ...d, sepShow: i ? 'inline' : 'none' })),
      inComps: P.inComps, inCompsTitle: P.inComps.length === 1 ? 'In 1 composition' : P.inComps.length ? 'In ' + P.inComps.length + ' compositions' : 'In no composition',
      delOpen: S.del, closeDel: () => this.setState({ del: false }),
      delOpts: [['frames', 'Remove from Frames', 'The original stays on disk. You can import it again later.'], ['trash', 'Also move the original to the trash', P.trashHint]].map(([k, label, hint]) => ({ label, hint, bg: mode === k ? 'rgba(255,255,255,.06)' : 'transparent', ring: mode === k ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: mode === k ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => this.setState({ delMode: k }) })),
      delLabel: mode === 'trash' ? 'Delete and trash file' : 'Delete photo', delSub: P.delSub, delWarn: P.delWarn,
      confirmDel: async () => { this.setState({ del: false }); await P.onDelete(mode); },
      ...this.mapVals(),
    };
  }
}
