/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto More.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { range: 'all', reason: 'all', ti: 0, done: 12, place: '', desc: '', acc: [], fyHidden: [], fyMore: [], prefer: null, dupeRes: {}, w: 0, ncName: '', ncCount: 3, ncLayout: 0, ncSizes: {}, tagAcc: [], tAi: 'idle', ncRemoved: [], ncAi: [], aiBusy: false, toast: '', tOp: 0 };
  componentWillUnmount() { clearTimeout(this.tT); clearTimeout(this.aT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 1800); }
  renderVals() {
    const S = this.state; const page = this.props.page || 'stats';
    const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const ph = (n, extra = {}) => ({ src: `photos/p${n}.jpg`, ar: AR[n - 1], ...extra });
    const fmt = (n) => Math.round(n).toLocaleString('en-AU');
    const v = {};
    // Stats
    const k = { all: 1, '2026': 0.38, '2025': 0.29 }[S.range];
    const bars = (title, rows, more, to) => { const max = Math.max(...rows.map((r) => r[1])); return { title, more: more || '', to: to || '', rows: rows.map(([label, n, rto]) => ({ label, v: fmt(n * k), pct: Math.round((n / max) * 100) + '%', to: rto || '' })) }; };
    Object.assign(v, {
      ranges: [['all', 'All time'], ['2026', '2026'], ['2025', '2025']].map(([id, label]) => ({ label, bg: S.range === id ? '#efede8' : 'transparent', fg: S.range === id ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ range: id }) })),
      big: [[fmt(48210 * k), 'photographs'], [Math.round(412 * k) + ' GB', 'storage'], [S.range === 'all' ? '71%' : S.range === '2026' ? '54%' : '88%', 'finished all reviews'], [S.range === '2025' ? '3.7' : '3.6', 'average rating'], [fmt(2906 * k), 'in compositions']].map(([v2, l]) => ({ v: v2, l })),
      statLists: [
        bars('Rating distribution', [['😐 meh', 3120], ['🙂 fine', 9840], ['😊 good', 14210], ['😄 great', 11980], ['😍 love', 4870]]),
        bars('Photos per shoot', [['Margaret River', 211, 'library'], ['Rottnest, March', 142, 'library'], ['Studio · Ana', 120, 'library'], ['Fremantle Markets', 86, 'library'], ['Beetle rally', 77, 'library']], 'All 214 →', 'shoots'),
        bars('Subjects', [['portrait', 6120, 'library'], ['landscape', 5410, 'library'], ['street', 3980, 'library'], ['car', 2210, 'library'], ['forest', 1870, 'library']], 'All 38 →', 'settings'),
        bars('Tags', [['autumn', 2840, 'library'], ['golden hour', 2310, 'library'], ['Portra 400', 1980, 'library'], ['black and white', 1720, 'library'], ['Perth', 1650, 'library']], 'All 612 →', 'settings'),
      ],
      months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
      trendPts: [3.4, 3.5, 3.7, 3.6, 3.8, 3.9].map((a, i) => `${32 + i * 133.6},${140 - ((a - 1) / 4) * 120}`).join(' '),
      sessions: [3.4, 3.6, 3.7, 3.8, 3.8].map((a, i) => ({ l: 'S' + (i + 1), v: a.toFixed(1), h: Math.round(((a - 3) / 1) * 100) + '%' })),
      top: [9, 7, 3, 10, 2, 1, 4, 6, 8].map((n) => ph(n)),
      comBig: [[fmt(146 * k + 6), 'photos you’ve reviewed'], [fmt(38 * Math.min(1, k * 1.6)), 'of yours shared'], [fmt(212 * k), 'ratings received'], [S.range === '2025' ? '4.0' : '4.1', 'community average'], [fmt(31 * k), 'written notes received']].map(([v2, l]) => ({ v: v2, l })),
      comCompare: [['You', 3.6, '#a8a59f'], ['Guests', 4.0, '#d9d6cf'], ['Community', S.range === '2025' ? 4.0 : 4.1, '#efede8']].map(([label, a, c]) => ({ label, c, v: a.toFixed(1), pct: Math.round((a / 5) * 100) + '%' })),
      comTop: [[7, 'Stone wall, gold hour', 34, '4.6'], [9, 'Under the jetty', 28, '4.4'], [8, 'Behind the lens', 19, '4.3'], [1, 'Autumn lane', 22, '4.2']].map(([n, name, c, avg]) => ({ src: 'photos/p' + n + '.jpg', name, n: c, avg })),
    });
    // To do
    const Q = [[3, 'Into the ferns', 'Kings Park dusk', 'Kings Park, Perth', ['forest', 'portrait', 'ferns'], 'A woman in a green coat among tall ferns at dusk.', ['dusk', 'green', 'Portra 400'], ['Nikon FM2', '50mm f/1.4', 'f/2', '1/125', '400', 'Portra 400']], [9, 'Under the jetty', 'Rottnest, March', 'Thomson Bay, Rottnest', ['beach', 'water', 'pier'], 'Looking along the jetty pylons into clear blue water.', ['summer', 'blue', 'symmetry'], ['Pentax 67', '105mm f/2.4', 'f/8', '1/250', '160', 'Portra 160']], [5, 'Blue Beetle', 'Beetle rally', 'Bunbury', ['car', 'street'], 'A sky-blue Volkswagen Beetle parked on a quiet street.', ['vintage', 'blue', 'chrome'], ['Fujifilm X-T5', '33mm f/1.4', 'f/4', '1/500', '200', '']], [1, 'Autumn lane', 'Margaret River', 'Margaret River', ['autumn', 'landscape', 'trees'], 'A lane of orange trees with leaves on the ground.', ['autumn', 'orange', 'golden hour'], ['Nikon FM2', '50mm f/1.4', 'f/5.6', '1/250', '400', 'Gold 200']]];
    const q = Q[S.ti % Q.length]; const counts = { all: 1284, camera: 412, location: 388, subjects: 220, tags: 164, composition: 100 };
    const R = S.reason; const show = (k) => R === k || (R === 'all' && ['location', 'subjects', 'desc'].includes(k));
    const CF = [['Body', 'Camera body'], ['Lens', 'Lens'], ['Aperture', 'f/–'], ['Shutter', '1/–'], ['ISO', 'ISO'], ['Film', 'Film stock']];
    const cam = S.cam || ['', '', '', '', '', ''];
    const aiBusy = S.tAi === 'busy'; const aiDone = S.tAi === 'done';
    const chip = (list, key) => list.map((s) => { const on = (S[key] || []).includes(s); return { label: (on ? '✓ ' : '✦ ') + s, bg: on ? 'rgba(255,255,255,.12)' : 'transparent', fg: on ? '#efede8' : '#a8a59f', ring: on ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.22)', go: () => this.setState((st) => ({ [key]: on ? (st[key] || []).filter((x) => x !== s) : [...(st[key] || []), s] })) }; });
    const reset = { place: '', desc: '', acc: [], tagAcc: [], cam: null, inComp: [], pin: null, placeSet: false, tAi: 'idle' };
    const COMPS = [['Green & gold', '9 photos · same tones'], ['Kitchen wall', 'Print 3 is empty'], ['Portraits 2026', 'portrait'], ['Autumn hallway', 'from this shoot']];
    Object.assign(v, {
      todoCount: fmt(counts[R] - (S.done - 12)), todoDone: S.done, todoWhat: { all: 'details', camera: 'camera specs', location: 'a location', subjects: 'subjects', tags: 'tags', composition: 'a composition' }[R],
      reasons: [['all', 'Everything'], ['camera', 'Camera specs'], ['location', 'Location'], ['subjects', 'Subjects'], ['tags', 'Tags'], ['composition', 'Not in a composition']].map(([id, label]) => ({ label, n: fmt(counts[id]), bg: R === id ? '#efede8' : 'rgba(255,255,255,.06)', fg: R === id ? '#0d0d0d' : '#a8a59f', nfg: '#6f6c67', go: () => this.setState({ reason: id, ...reset }) })),
      tShowCamera: show('camera'), tShowLocation: show('location'), tShowSubjects: show('subjects'), tShowTags: show('tags'), tShowDesc: show('desc'), tShowComp: show('composition'), mapH: R === 'location' ? '260px' : '150px',
      tPhoto: `photos/p${q[0]}.jpg`, tTitle: q[1], tShoot: q[2], tIdx: S.done - 11, tPlace: S.place, tPlaceHint: q[3], tPlaceSuggest: !S.place,
      tCam: CF.map(([label, ph], i) => ({ label, ph, value: cam[i], ring: cam[i] ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.12)', onChange: (e) => { const nx = [...(this.state.cam || cam)]; nx[i] = e.target.value; this.setState({ cam: nx }); } })),
      tCamMissing: cam.filter((x) => !x).length + ' of 6 missing', tRollHint: q[7].filter(Boolean).slice(0, 2).join(' · '), useRoll: () => this.setState({ cam: [...q[7]] }),
      tTags: chip(q[6], 'tagAcc'), tShootTags: q[2] + ', ' + (q[7][5] || 'digital'),
      tComps: COMPS.map(([name, why]) => { const on = (S.inComp || []).includes(name); return { name, why, tick: on ? '✓' : '', boxBg: on ? '#efede8' : 'transparent', boxRing: on ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.3)', go: () => this.setState((st) => ({ inComp: on ? (st.inComp || []).filter((x) => x !== name) : [...(st.inComp || []), name] })) }; }),
      tAiLabel: aiBusy ? 'Analyzing…' : aiDone ? '✓ Analyzed' : '✦ Analyze with AI', tAiFg: aiBusy ? '#a8a59f' : '#efede8',
      tAiSpin: aiBusy ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
      tAnalyze: () => { if (aiBusy) return; this.setState({ tAi: 'busy' }); clearTimeout(this.aiT); this.aiT = setTimeout(() => { const hit = q[3]; this.setState({ tAi: 'done', place: hit, placeSet: true, pin: null, acc: [...q[4]], tagAcc: [...q[6]], desc: q[5], cam: q[7].map((x) => x || '') }); this.flash('Filled in by AI · check it, then save'); }, 1800); },
      onPlace: (e) => this.setState({ place: e.target.value, placeSet: false }), usePlace: () => this.setState({ place: q[3], placeSet: true }),
      ...(() => {
        const PL = [['Kings Park, Perth', 'WA', 34, 52, '-31.96, 115.83'], ['Thomson Bay, Rottnest', 'WA', 16, 44, '-32.00, 115.54'], ['Fremantle', 'WA', 28, 64, '-32.06, 115.75'], ['Bunbury', 'WA', 40, 86, '-33.33, 115.64'], ['Margaret River', 'WA', 30, 94, '-33.95, 115.08'], ['Perth CBD', 'WA', 42, 50, '-31.95, 115.86'], ['Melbourne', 'VIC', 86, 70, '-37.81, 144.96'], ['Ballarat', 'VIC', 80, 64, '-37.56, 143.85']];
        const t = S.place.trim().toLowerCase(); const hit = PL.find((p) => p[0].toLowerCase() === t);
        const hits = t && !S.placeSet ? PL.filter((p) => p[0].toLowerCase().includes(t)).slice(0, 5) : [];
        const pin = S.pin || (hit ? { x: hit[2], y: hit[3], label: hit[0].split(',')[0], c: hit[4] } : null);
        return {
          placeOpen: hits.length > 0, placeHits: hits.map((p) => ({ name: p[0], region: p[1], pick: () => this.setState({ place: p[0], placeSet: true, pin: null }) })),
          pinX: (pin ? pin.x : 50) + '%', pinY: (pin ? pin.y : 50) + '%', pinOp: pin ? 1 : 0, pinLabel: pin ? pin.label : '', pinCoords: pin ? pin.c : '', mapHint: pin ? 'Click to move the pin' : 'Search above, or click to drop a pin',
          dropPin: (e) => { const b = e.currentTarget.getBoundingClientRect(); const x = Math.round(((e.clientX - b.left) / b.width) * 100); const y = Math.round(((e.clientY - b.top) / b.height) * 100); const lat = (-31.5 - y * 0.06).toFixed(2), lng = (115 + x * 0.3).toFixed(2); this.setState({ pin: { x, y, label: 'Dropped pin', c: lat + ', ' + lng }, place: 'Pinned · ' + lat + ', ' + lng, placeSet: true }); },
        };
      })(),
      tSubjects: chip(q[4], 'acc'),
      tDesc: S.desc, tDescHint: q[5], onDesc: (e) => this.setState({ desc: e.target.value }), useDesc: () => this.setState({ desc: q[5] }),
      skipTodo: () => { this.setState({ ti: S.ti + 1, ...reset }); this.flash('Skipped · it stays on the list'); },
      saveTodo: () => { this.setState({ ti: S.ti + 1, done: S.done + 1, ...reset }); this.flash('Saved · next photo'); },
      todoNavBg: page === 'todo' ? 'rgba(255,255,255,.1)' : 'transparent',
    });
    // For you
    const FY = [['growing', 'Growing on you', 'Ratings rising across sessions', [7, 10, 3, 1], { badges: ['3.0 → 4.5', '3.5 → 4.5', '3.0 → 4.0', '2.5 → 4.0'] }], ['together', 'Belongs together: Blue hour', '9 photos from 4 shoots share blue tones and dusk light', [2, 9, 3, 6, 4], { primary: true }], ['forgotten', 'Worth another look', 'Loved before, not seen for 8 months', [4, 8, 5, 10], {}], ['quiet', 'Quietly excellent', 'Rated highly every time, in no composition', [6, 1, 9, 2, 7], {}], ['beside', 'Would work beside “Stone wall, gold hour”', 'Matching warm tones, from other shoots', [10, 1, 4, 8], {}], ['archive', 'Consider leaving out of review', 'Averaging under 2 after four sessions', [5, 3, 6], { noMore: true }]];
    const fy = FY.filter(([id]) => !S.fyHidden.includes(id)).map(([id, h, why, ns, o]) => ({ h, why, hasPrimary: !!o.primary, hasMore: !o.primary && !o.noMore, moreLabel: S.fyMore.includes(id) ? '✓ Noted' : 'More like this', more: () => this.setState({ fyMore: [...S.fyMore, id] }), hide: () => { this.setState({ fyHidden: [...S.fyHidden, id] }); this.flash('Got it · fewer like this'); }, photos: ns.map((n, i) => ph(n, { badge: o.badges ? o.badges[i] : '', badgeShow: o.badges ? 'block' : 'none' })) }));
    Object.assign(v, { fy, fyEmpty: fy.length === 0, fyReset: () => this.setState({ fyHidden: [], fyMore: [] }) });
    // Compare
    const A = { src: 'photos/p7.jpg', title: 'Stone wall, gold hour', pal: ['#3d322f', '#7c6351', '#f3f4e0', '#91a490', '#d2a06b'] }, B = { src: 'photos/p10.jpg', title: 'Wall lean, wider', pal: ['#2f2a26', '#8a6a52', '#e9e2c8', '#9aa892', '#c99a63'] };
    const rows = [['Average rating', '4.3 😊 (4)', '3.8 😊 (3)'], ['Pixels', '6000 × 4000', '6000 × 4000'], ['Captured', '8 Nov 2026, 16:42', '8 Nov 2026, 16:43'], ['Camera', 'Fujifilm X-T5', 'Fujifilm X-T5'], ['Exposure', '56mm · f/1.2 · 1/1000', '56mm · f/2 · 1/500'], ['Light', 'mid-tone, high contrast', 'mid-tone, medium contrast'], ['Subjects', 'portrait', 'portrait'], ['In compositions', 'Kitchen wall, +2', '—']];
    Object.assign(v, {
      sides: [['a', A], ['b', B]].map(([id, s]) => ({ ...s, ring: S.prefer === id ? '0 0 0 2px #efede8' : 'none', btn: S.prefer === id ? '✓ Preferred' : 'Prefer this', btnBg: S.prefer === id ? '#efede8' : 'transparent', btnFg: S.prefer === id ? '#0d0d0d' : '#efede8', pick: () => { this.setState({ prefer: id }); this.flash(id === 'a' ? 'Noted · the other one drops a little in rankings' : 'Noted · this one rises in rankings'); } })),
      cmpRows: rows.map(([k2, a, b], i) => ({ k: k2, a, b, aFg: a !== b ? '#efede8' : '#8f8c86', bFg: a !== b ? '#efede8' : '#8f8c86', border: i < rows.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none' })),
    });
    // Duplicates
    const G = [['g1', [[2, 'DSCF2201.RAF', '6000 × 4000 · largest', true], [3, 'DSCF2201-edit.jpg', '4000 × 2667']]], ['g2', [[1, 'IMG_4410.HEIC', '4032 × 3024 · largest', true], [4, 'IMG_4410 (1).jpg', '2048 × 1536'], [10, 'IMG_4410-crop.jpg', '1800 × 2400']]], ['g3', [[6, 'roll41_12.tif', '5400 × 3600 · largest', true], [7, 'roll41_12_bw.jpg', '2700 × 1800']]]];
    Object.assign(v, {
      dupeLeft: G.filter(([id]) => !S.dupeRes[id]).length,
      dupes: G.map(([id, ps]) => { const r = S.dupeRes[id]; const set = (x) => this.setState((s) => ({ dupeRes: { ...s.dupeRes, [id]: x } })); return { open: !r, closed: !!r, op: r ? 0.6 : 1, status: r === 'link' ? '✓ Linked as variants · the largest is shown' : 'Marked as different', link: () => set('link'), diff: () => set('diff'), undo: () => set(null), photos: ps.map(([n, file, meta, big]) => ({ src: `photos/p${n}.jpg`, file, meta, ring: big ? '0 0 0 2px #efede8' : 'none' })) }; }),
    });
    // Welcome
    const W = [['Bring your photos in', 'Frames starts with your photos. Bring in a shoot from this computer or a cloud folder, and it sorts them for you.', ['Upload from this computer, or connect Google Drive, iCloud or Dropbox', 'New photos are grouped into shoots by day, ready to name', 'Your originals are only ever read, never changed'], 'photos/p5.jpg'], ['Shoots and compositions', 'A shoot is a day out or a roll of film. A composition is a wall of prints you’re planning to hang.', ['Each composition has prints, sizes, frames and mats', 'Frames ranks candidate photos to fill each print', 'Export sends the originals with print notes to your lab'], 'photos/p4.jpg'], ['Rate a little, often', 'Each photo comes back a few times over weeks, so the score that settles is honest.', ['A review is about 12 photos and takes a few minutes', 'Your past ratings stay hidden while you rate', 'Settled scores rank compositions and fill your portfolio'], 'photos/p7.jpg'], ['Ask other people', 'Share a composition with a link and let friends weigh in before you print.', ['Guests don’t need an account', 'They rate photos and suggest swaps; you approve or deny', 'Their scores stay separate from yours'], 'photos/p9.jpg']];
    const w = W[S.w]; const last = S.w === W.length - 1;
    Object.assign(v, { wStep: S.w + 1, wTitle: w[0], wBody: w[1], wFacts: w[2].map((t, i) => ({ n: '0' + (i + 1), t })), wImg: w[3], wFirst: S.w === 0, wHasBack: S.w > 0, wBack: () => this.setState({ w: S.w - 1 }), wNext: () => { if (last) location.hash = 'home'; else this.setState({ w: S.w + 1 }); }, wNextLabel: last ? 'Start using Frames' : 'Next', wDots: W.map((_, i) => ({ bg: i === S.w ? '#efede8' : 'rgba(255,255,255,.2)', go: () => this.setState({ w: i }) })) });
    // New composition
    const L = {
      1: [['Portrait', [[33, 8, 34, 48]]], ['Landscape', [[22, 12, 56, 40]]], ['Square', [[30, 12, 40, 40]]], ['Panorama', [[8, 20, 84, 24]]]],
      2: [['Side by side', [[22, 10, 26, 44], [52, 10, 26, 44]]], ['Stacked', [[32, 3, 36, 27], [32, 34, 36, 27]]], ['Big and small', [[18, 6, 38, 52], [60, 26, 22, 32]]], ['Landscape pair', [[8, 16, 40, 30], [52, 16, 40, 30]]]],
      3: [['Row', [[12, 14, 22, 36], [39, 14, 22, 36], [66, 14, 22, 36]]], ['Column', [[36, 2, 28, 18], [36, 23, 28, 18], [36, 44, 28, 18]]], ['Feature + 2', [[14, 6, 40, 52], [58, 6, 26, 24], [58, 34, 26, 24]]], ['Centre feature', [[8, 18, 22, 28], [34, 6, 32, 52], [70, 18, 22, 28]]]],
      4: [['Grid 2 × 2', [[28, 2, 20, 28], [52, 2, 20, 28], [28, 34, 20, 28], [52, 34, 20, 28]]], ['Row', [[6, 16, 20, 32], [29, 16, 20, 32], [52, 16, 20, 32], [75, 16, 20, 32]]], ['Feature + 3', [[14, 4, 40, 56], [58, 4, 26, 17], [58, 23.5, 26, 17], [58, 43, 26, 17]]], ['Landscape grid', [[18, 6, 30, 24], [52, 6, 30, 24], [18, 34, 30, 24], [52, 34, 30, 24]]]],
      5: [['Feature + 4', [[30, 8, 40, 48], [8, 8, 18, 22], [8, 34, 18, 22], [74, 8, 18, 22], [74, 34, 18, 22]]], ['3 over 2', [[14, 2, 22, 28], [39, 2, 22, 28], [64, 2, 22, 28], [26, 34, 22, 28], [52, 34, 22, 28]]], ['Row', [[4, 18, 16, 28], [23, 18, 16, 28], [42, 18, 16, 28], [61, 18, 16, 28], [80, 18, 16, 28]]], ['Cross', [[40, 2, 20, 18], [40, 23, 20, 18], [40, 44, 20, 18], [16, 23, 20, 18], [64, 23, 20, 18]]]],
      6: [['Grid 3 × 2', [[18, 2, 20, 28], [40, 2, 20, 28], [62, 2, 20, 28], [18, 34, 20, 28], [40, 34, 20, 28], [62, 34, 20, 28]]], ['Grid 2 × 3', [[26, 2, 23, 18], [51, 2, 23, 18], [26, 23, 23, 18], [51, 23, 23, 18], [26, 44, 23, 18], [51, 44, 23, 18]]], ['Row', [[3, 20, 13, 24], [19.5, 20, 13, 24], [36, 20, 13, 24], [52.5, 20, 13, 24], [69, 20, 13, 24], [85.5, 20, 13, 24]]], ['Salon', [[6, 4, 26, 34], [36, 4, 26, 18], [66, 4, 28, 26], [6, 42, 26, 20], [36, 26, 26, 36], [66, 34, 28, 28]]]],
    };
    const nc = S.ncCount; const rowOf = (k) => { const g = 1.2, w = Math.min(14, (96 - g * (k - 1)) / k), h = Math.min(w * 1.4, 40); const x0 = (100 - (w * k + g * (k - 1))) / 2; return Array.from({ length: k }, (_, i) => [x0 + i * (w + g), (64 - h) / 2, w, h]); };
    const opts = L[nc] || [['Row', rowOf(nc)]]; const li = Math.min(S.ncLayout, opts.length - 1); const rects = opts[li][1];
    const KNOWN = { bird: 'subject', birds: 'subject', beach: 'subject', autumn: 'tag', car: 'subject', cars: 'subject', forest: 'subject', blue: 'colour', orange: 'colour', green: 'colour', portrait: 'subject', portraits: 'subject', film: 'tag', night: 'tag', street: 'subject' };
    const words = S.ncName.toLowerCase().split(/[^a-z]+/).filter((x) => KNOWN[x]).map((x) => x.replace(/s$/, ''));
    const chips = [...new Set([...words, ...S.ncAi])].filter((c) => !S.ncRemoved.includes(c));
    const maxA = Math.max(...rects.map((r) => r[2] * r[3]));
    const SZ = ['A4', 'A3', 'A2', 'A1'];
    const sizeOf = (r, i) => (S.ncSizes[nc + '-' + li + '-' + i]) || (r[2] * r[3] >= maxA * 0.95 && rects.some((x) => x[2] * x[3] < maxA * 0.7) ? 'A2' : nc >= 5 ? 'A4' : 'A3');
    Object.assign(v, {
      ncName: S.ncName, onNcName: (e) => this.setState({ ncName: e.target.value, ncRemoved: [] }),
      ncCount: nc, ncDec: () => { if (nc > 1) this.setState({ ncCount: nc - 1, ncLayout: 0 }); }, ncInc: () => { if (nc < 12) this.setState({ ncCount: nc + 1, ncLayout: 0 }); }, ncDecFg: nc > 1 ? '#efede8' : '#4a4845', ncIncFg: nc < 12 ? '#efede8' : '#4a4845',
      layouts: opts.map(([label, rs], i) => { const on = i === li; return { label, bg: on ? '#efede8' : 'transparent', fg: on ? '#0d0d0d' : '#efede8', hover: on ? '#efede8' : 'rgba(255,255,255,.04)', ring: on ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.16)', wall: on ? '#dcd9d2' : 'rgba(255,255,255,.04)', blockBg: on ? '#0d0d0d' : '#a8a59f', blocks: rs.map(([x, y, w, h]) => ({ x: x + '%', y: (y / 64) * 100 + '%', w: w + '%', h: (h / 64) * 100 + '%' })), go: () => this.setState({ ncLayout: i }) }; }),
      ncPrints: rects.map((r, i) => { const size = sizeOf(r, i); return { n: i + 1, size, orient: r[2] > r[3] * 1.05 ? 'Landscape' : Math.abs(r[2] - r[3]) < 2 ? 'Square crop' : 'Portrait', frame: 'Black frame', cycle: () => this.setState((s) => ({ ncSizes: { ...s.ncSizes, [nc + '-' + li + '-' + i]: SZ[(SZ.indexOf(size) + 1) % SZ.length] } })) }; }),
      ncCreate: () => { try { localStorage.setItem('frames-newcomp', JSON.stringify({ name: S.ncName.trim() || 'New composition', rects, sizes: rects.map(sizeOf) })); } catch (e) {} },
      ncChips: chips.map((c) => ({ label: '✦ ' + c, remove: () => this.setState({ ncRemoved: [...S.ncRemoved, c] }) })),
      ncChipHint: chips.length ? '' : 'Type a name, or add subjects, tags and colours',
      aiLabel: S.aiBusy ? 'Asking the AI…' : '✨ Find with AI', aiSpin: S.aiBusy ? React.createElement('i', { style: { width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block' } }) : null,
      askAi: () => { if (S.aiBusy) return; this.setState({ aiBusy: true }); clearTimeout(this.aT); this.aT = setTimeout(() => this.setState((s) => ({ aiBusy: false, ncAi: s.ncName.toLowerCase().includes('beach') ? ['water', 'blue', 'summer'] : ['golden hour', 'warm tones'] })), 1400); },
      ncSummary: (chips.length ? fmt(chips.length * 37 + 12) + ' candidates for ' : '') + nc + (nc === 1 ? ' print' : ' prints') + ' · ' + opts[li][0].toLowerCase() + (chips.length ? '' : ' · you add photos next'),
    });
    const flags = {}; for (const p of ['stats', 'todo', 'foryou', 'compare', 'dupes', 'welcome', 'new']) flags['is' + p[0].toUpperCase() + p.slice(1)] = p === page;
    return { ...v, ...flags, navShow: page === 'welcome' ? 'none' : 'flex', screenLabel: page, toast: S.toast, toastOp: S.tOp };
  }
}
