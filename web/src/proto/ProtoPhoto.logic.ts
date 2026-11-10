/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Photo.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { idx: 12, more: false, picker: false, pickQ: '', inSet: ['Kitchen wall', 'Portraits 2026', 'Studio feature'], pt: '', pf: false, ptext: '', rateOpen: false, mine: null, note: '', ai: 'idle', acc: [], det: { camera: 'X-T5', lens: '56mm', ap: 'f/1.2', place: 'Fremantle', lat: -32.0569, lng: 115.7439, prec: 'Suburb' }, map: null };
  componentDidMount() { try { const c = localStorage.getItem('frames-country'); if (c) this.setState({ country: c }); } catch (e) {} this.onCountry = (e) => this.setState({ country: e.detail }); window.addEventListener('frames-country', this.onCountry); this.onKey = (e) => { if (e.target.tagName === 'INPUT') return; if (e.key === 'r' || e.key === 'R') this.setState((s) => ({ rateOpen: !s.rateOpen })); else if (this.state.rateOpen && /^[1-5]$/.test(e.key)) this.setState({ mine: +e.key }); else if (e.key === 'Escape') this.setState({ rateOpen: false }); }; window.addEventListener('keydown', this.onKey); }
  componentWillUnmount() { window.removeEventListener('frames-country', this.onCountry); window.removeEventListener('keydown', this.onKey); clearTimeout(this.aiT); clearTimeout(this.ptT); }
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
    const pfState = S.pfState || 'auto';
    const TAKEN = '2026-11-08', UPLOADED = '2026-11-09'; const hasExif = S.noExif !== true;
    const dv = S.date ?? (hasExif ? TAKEN : UPLOADED); const dt = dv ? new Date(dv + 'T12:00:00') : null;
    const country = S.country || 'Australia'; const south = ['Australia', 'New Zealand', 'South Africa', 'Argentina', 'Brazil', 'Chile'].includes(country);
    const SE = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter']; const FLIP = { Winter: 'Summer', Summer: 'Winter', Spring: 'Autumn', Autumn: 'Spring' };
    const season = dt ? (south ? FLIP[SE[dt.getMonth()]] : SE[dt.getMonth()]) : '—';
    const DOT = { Spring: 'oklch(0.75 0.12 150)', Summer: 'oklch(0.8 0.13 85)', Autumn: 'oklch(0.68 0.14 45)', Winter: 'oklch(0.72 0.07 240)', '—': '#5c5a56' };
    return {
      dateVal: dv || '', onDate: (e) => this.setState({ date: e.target.value }), dateEdited: S.date != null && S.date !== (hasExif ? TAKEN : UPLOADED), resetDate: () => this.setState({ date: null }),
      dateTitle: 'Click to change the date', dateSrc: S.date != null && S.date !== (hasExif ? TAKEN : UPLOADED) ? 'Date edited by you' : hasExif ? 'Date taken, from camera data' : 'No camera date · using the upload date',
      season, seasonDot: DOT[season], seasonTitle: season + ' in the ' + (south ? 'southern' : 'northern') + ' hemisphere (' + country + ' · change in Settings → Profile)',
      pfLabel: pfState === 'in' ? 'In portfolio' : pfState === 'auto' ? 'Auto · score 4.3' : 'Add to portfolio', pfTitle: pfState === 'auto' ? 'Added by your score rule · click to keep it out' : pfState === 'in' ? 'Click to remove from portfolio' : 'Click to add',
      pfDotBg: pfState === 'in' ? '#efede8' : 'transparent', pfDotRing: pfState === 'out' ? 'inset 0 0 0 1.5px rgba(255,255,255,.3)' : pfState === 'auto' ? 'inset 0 0 0 1.5px #efede8' : 'none',
      togglePf: () => { const nx = pfState === 'out' ? 'in' : 'out'; this.setState({ pfState: nx, fav: nx === 'out' ? false : S.fav }); this.ptoast(pfState === 'auto' ? 'Kept out of portfolio · the score rule won’t re-add it' : nx === 'in' ? 'Added to portfolio' : 'Removed from portfolio'); },
      favLabel: S.fav ? '★ Favourite' : '☆ Favourite', favFg: S.fav ? '#efede8' : '#a8a59f',
      toggleFav: () => { this.setState({ fav: !S.fav, pfState: !S.fav ? 'in' : pfState }); this.ptoast(S.fav ? 'Removed from favourites' : 'Favourited · pinned to the top of your portfolio'); },
      pickThumbs: ['photos/p7.jpg'], inSetList: S.inSet, pickDone: (sel, msg) => { if (sel) this.setState({ inSet: sel }); this.ptoast(msg); },
      photoIdx: S.idx, prevPhoto: () => this.setState({ idx: S.idx > 1 ? S.idx - 1 : 86 }), nextPhoto: () => this.setState({ idx: S.idx < 86 ? S.idx + 1 : 1 }),
      goBack: () => { location.hash = 'library'; }, findSimilar: () => { location.hash = 'search'; },
      pToast: S.ptext, pToastOp: S.pt ? 1 : 0,
      moreOpen: S.more, toggleMore: () => this.setState({ more: !S.more }), moreFg: S.more ? '#efede8' : '#a8a59f', moreBg: S.more ? 'rgba(255,255,255,.08)' : 'transparent',
      moreItems: [
        { label: 'Compare with a similar photo', meta: '', sep: 'block', fg: '#efede8', go: () => { this.setState({ more: false }); location.hash = 'compare'; } },
        { label: 'Download original', meta: '24 MB', sep: 'none', fg: '#efede8', go: close('Downloading DSCF4182.RAF') },
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
    const D = this.state.det; const F = [['camera', 'Camera', 'Camera'], ['lens', 'Lens', 'Lens'], ['ap', 'Aperture', 'f/–']];
    return { ...this.mapVals(), placeLabel: D.place || 'Add a place', placeFg: D.place ? '#efede8' : '#8f8c86', detailFields: F.map(([k, title, ph], i) => ({ value: D[k], title: title + ' · click to edit', ph, sepShow: i ? 'inline' : 'none', size: Math.max(3, (D[k] || ph).length), onChange: (e) => this.setState((s) => ({ det: { ...s.det, [k]: e.target.value } })) })) };
  }
  PLACES = [['Fremantle', 'Western Australia', 'City', 'CI', -32.0569, 115.7439], ['Fremantle Markets', 'South Terrace, Fremantle', 'Market', 'BU', -32.0563, 115.7489], ['Bathers Beach', 'Fremantle', 'Beach', 'PL', -32.0567, 115.7414], ['Round House', 'Captains Lane, Fremantle', 'Landmark', 'LM', -32.0560, 115.7406], ['Little Creatures', 'Mews Rd, Fremantle', 'Brewery', 'BU', -32.0613, 115.7454], ['Cottesloe Beach', 'Cottesloe', 'Beach', 'PL', -31.9939, 115.7516], ['Perth', 'Western Australia', 'City', 'CI', -31.9523, 115.8613], ['Kings Park', 'Perth', 'Park', 'PL', -31.9601, 115.8326]];
  mapVals() {
    const S = this.state; const M = S.map; if (!M) return { mapOpen: false, openMap: () => { const D = this.state.det; this.setState({ map: { q: '', name: D.place, sub: '', lat: D.lat ?? -32.0569, lng: D.lng ?? 115.7439, prec: D.prec || 'Suburb', picked: D.place } }); } };
    const set = (p) => this.setState((s) => ({ map: { ...s.map, ...p } })); const Z = 15, TS = 256, W = 552, H = 280, N = TS * Math.pow(2, Z);
    const toPx = (lat, lng) => { const r = lat * Math.PI / 180; return [(lng + 180) / 360 * N, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * N]; };
    const toLL = (x, y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180 / Math.PI, x / N * 360 - 180];
    const [cx, cy] = toPx(M.lat, M.lng); const x0 = cx - W / 2, y0 = cy - H / 2; const tiles = [];
    for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x0 + W) / TS); tx++) for (let ty = Math.floor(y0 / TS); ty <= Math.floor((y0 + H) / TS); ty++) tiles.push({ src: 'https://' + 'abcd'[(tx + ty) & 3] + '.basemaps.cartocdn.com/dark_all/' + Z + '/' + tx + '/' + ty + '.png', left: Math.round(tx * TS - x0) + 'px', top: Math.round(ty * TS - y0) + 'px' });
    const q = M.q.trim().toLowerCase(); const list = (q ? this.PLACES.filter((p) => (p[0] + ' ' + p[1] + ' ' + p[2]).toLowerCase().includes(q)) : this.PLACES.slice(0, 5));
    const pick = (p) => set({ name: p[0], sub: p[1], lat: p[4], lng: p[5], picked: p[0], q: '', prec: p[2] === 'City' ? 'City' : M.prec });
    const suburb = M.sub && M.sub.includes(',') ? M.sub.split(',').pop().trim() : M.sub || M.name;
    const shown = !M.name ? '' : M.prec === 'Exact' ? M.name : M.prec === 'Suburb' ? (suburb || M.name) : ((M.sub && M.sub.includes('Western Australia')) ? M.name : 'Perth');
    return {
      mapOpen: true, closeMap: () => this.setState({ map: null }), mapQ: M.q, onMapQ: (e) => set({ q: e.target.value }), mapKey: (e) => { if (e.key === 'Enter' && list[0]) pick(list[0]); if (e.key === 'Escape') this.setState({ map: null }); },
      mapListTitle: q ? list.length + (list.length === 1 ? ' place' : ' places') : 'Near the pin', mapNone: !!q && !list.length,
      mapResults: list.map((p) => ({ name: p[0], sub: p[1], kind: p[2], icon: p[3], bg: M.picked === p[0] ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => pick(p) })),
      mapTiles: tiles, mapCoords: M.lat.toFixed(4) + ', ' + M.lng.toFixed(4),
      mapClick: (e) => { const r = e.currentTarget.getBoundingClientRect(); const k = r.width / W; const [lat, lng] = toLL(cx + ((e.clientX - r.left) / k - W / 2), cy + ((e.clientY - r.top) / k - H / 2)); set({ lat, lng, name: M.name || 'Dropped pin', picked: null }); },
      mapPrec: ['Exact', 'Suburb', 'City'].map((k) => ({ label: k, bg: M.prec === k ? '#efede8' : 'transparent', fg: M.prec === k ? '#0d0d0d' : '#a8a59f', pick: () => set({ prec: k }) })),
      mapSummary: M.name ? M.name + (M.picked ? '' : ' · pin moved') + ' · shows as “' + shown + '”' : 'No place yet', mapHasPlace: !!this.state.det.place,
      mapRemove: () => { this.setState((s) => ({ map: null, det: { ...s.det, place: '' } })); this.ptoast('Place removed'); },
      mapSave: () => { if (!M.name) return; this.setState((s) => ({ map: null, det: { ...s.det, place: M.name, lat: M.lat, lng: M.lng, prec: M.prec } })); this.ptoast('Place saved · ' + M.name); },
    };
  }
  aiVals() {
    const S = this.state; const busy = S.ai === 'busy'; const done = S.ai === 'done';
    const sug = ['golden hour', 'streetwear', 'sunglasses', 'warm tones'];
    return {
      aiLabel: busy ? 'Analyzing…' : done ? '✓ Analyzed · run again' : '✦ Analyze with AI', aiFg: busy ? '#a8a59f' : '#efede8', aiCursor: busy ? 'default' : 'pointer',
      aiSpinner: busy ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
      runAi: () => { if (busy) return; this.setState({ ai: 'busy', acc: [] }); clearTimeout(this.aiT); this.aiT = setTimeout(() => this.setState((st) => ({ ai: 'done', title: st.titleEdited ? st.title : 'Stone wall, gold hour', titleFlash: !st.titleEdited })), 2400); clearTimeout(this.tfT); this.tfT = setTimeout(() => this.setState({ titleFlash: false }), 3400); },
      titleVal: S.title || '', titlePh: busy ? 'Naming it…' : 'Untitled', onTitle: (e) => this.setState({ title: e.target.value, titleEdited: true }), titleBg: S.titleFlash ? 'rgba(239,237,232,.1)' : 'transparent',
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
    const SN = this.state.sens || [];
    const sens = ['Nudity', 'Violence', 'Adult'].map((k) => { const on = SN.includes(k); return { label: (on ? '⚠ ' : '') + k, bg: on ? 'oklch(0.62 0.17 28 / .22)' : 'transparent', fg: on ? 'oklch(0.85 0.1 28)' : '#8f8c86', ring: on ? 'inset 0 0 0 1px oklch(0.62 0.17 28 / .6)' : 'inset 0 0 0 1px rgba(255,255,255,.16)', go: () => { const nx = on ? SN.filter((x) => x !== k) : [...SN, k]; this.setState({ sens: nx }); this.ptoast(nx.length ? 'Marked ' + nx.join(', ').toLowerCase() + ' · hidden from community review' : 'No longer marked sensitive'); } }; });
    return { sens, mates, ratings, ratingsAfter, progress, allComps, inComps, recentComps, ...this.rateVals(), ...this.aiVals(), ...this.detVals(), ...this.barVals(), ...this.delVals() };
  }
}
