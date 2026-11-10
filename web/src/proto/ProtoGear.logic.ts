/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Gear.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  KEY = 'frames-gear2';
  TYPES = ['Body', 'Lens', 'Film', 'Light', 'App', 'Other'];
  TYPE_TITLE = { Body: 'Cameras', Lens: 'Lenses', Film: 'Film', Light: 'Light & meters', App: 'Apps & tools', Other: 'Other' };
  DEF = {
    intro: 'Old Minoltas, a Leica and a couple of Soviet bodies. Mostly manual, all older than me.',
    arrange: 'system',
    items: [
      ['Early Minolta XD', 'Body', 'Minolta', 'Minolta MD', 1977, 1240], ['MD 50mm f1.7', 'Lens', 'Minolta', 'Minolta MD', 1977, 980], ['MD Tele Rokkor 135mm f2.8', 'Lens', 'Minolta', 'Minolta MD', 1978, 140],
      ['1951 Leica IIIc', 'Body', 'Leitz', 'Leica screw mount', 1951, 410], ['Elmar 3.5 (red scale)', 'Lens', 'Leitz', 'Leica screw mount', 1950, 360], ['Industar 22 collapsible', 'Lens', 'FED', 'Leica screw mount', 1955, 50], ['Industar 60 (LTM)', 'Lens', 'FED', 'Leica screw mount', 1990, 20],
      ['Pentax 6x7, non-MLU', 'Body', 'Pentax', 'Pentax 6×7', 1969, 620], ['SMC Takumar 150mm f2.8', 'Lens', 'Pentax', 'Pentax 6×7', 1972, 380],
      ['1956 Zenit C', 'Body', 'KMZ', 'M39 SLR', 1956, 90], ['Industar 22 (SLR)', 'Lens', 'KMZ', 'M39 SLR', 1956, 40], ['Helios 44 58mm f2 M39', 'Lens', 'KMZ', 'M39 SLR', 1958, 60],
      ['FilmCalc', 'App', '', 'Tools', 0, 0, 'Price of shooting film'], ['Light Meter', 'App', '', 'Tools', 0, 0, 'For cameras without a meter'], ['White Border', 'App', '', 'Tools', 0, 0, 'Add a white border to images'],
    ].map(([name, type, brand, system, year, used, note]) => ({ name, type, brand, system, year, used, note: note || '' })),
    wish: [
      { name: 'Mamiya 7 II + 80mm f4', price: '$3,400', url: 'https://www.ebay.com.au/sch/i.html?_nkw=mamiya+7+ii', why: 'Lighter 6×7 for travel', fits: '' },
      { name: 'Leica Summitar 50mm f2', price: '$380', url: 'https://www.ebay.com.au/sch/i.html?_nkw=summitar', why: 'Faster than the Elmar for low light', fits: 'Fits your Leica IIIc' },
      { name: 'Sekonic L-308X light meter', price: '$310', url: 'https://www.camerahouse.com.au', why: '', fits: 'For the IIIc and Pentax 6×7' },
      { name: 'Minolta MD 28mm f2.8', price: '$120', url: 'https://www.ebay.com.au/sch/i.html?_nkw=minolta+md+28mm', why: 'A wide for the XD', fits: 'Fits your Minolta XD' },
      { name: 'Pentax 67 wooden grip', price: '$95', url: 'https://www.ebay.com.au/sch/i.html?_nkw=pentax+67+grip', why: '', fits: 'Fits your Pentax 6×7' },
    ],
    showWish: true,
  };
  state = (() => { let d = this.DEF; try { const raw = localStorage.getItem('frames-gear2'); if (raw) { const j = JSON.parse(raw); d = { ...this.DEF, ...j, wish: Array.isArray(j.wish) ? j.wish.map((w) => (Array.isArray(w) ? { name: w[0] || '', price: w[1] || '—', url: w[2] || '', why: '', fits: '' } : { name: '', price: '—', url: '', why: '', fits: '', ...w })) : this.DEF.wish, items: Array.isArray(j.items) ? j.items.map((x) => (Array.isArray(x) ? { name: x[0] || '', type: x[1] || 'Other', brand: '', system: 'Other', year: 0, used: 0, note: x[2] || '' } : { name: '', type: 'Other', brand: '', system: 'Other', year: 0, used: 0, note: '', ...x })) : this.DEF.items }; } } catch (e) {} return { ...d, nName: '', nPrice: '', nUrl: '', addTop: false, dragI: null }; })();
  componentWillUnmount() { clearTimeout(this.tT); clearTimeout(this.sT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2000); }
  save(patch) { this.setState(patch, () => { const { intro, items, wish, showWish, arrange, cur } = this.state; try { localStorage.setItem(this.KEY, JSON.stringify({ intro, items, wish, showWish, arrange, cur })); } catch (e) {} this.setState({ syncing: true }); clearTimeout(this.sT); this.sT = setTimeout(() => this.setState({ syncing: false }), 600); }); }
  addNow() { const S = this.state; if (S.nName.trim().length < 2) return; const p = S.nPrice.trim(); const u = S.nUrl.trim(); const item = { name: S.nName.trim(), price: p ? (this.state.cur || '$') + p.replace(/^[^0-9]+/, '') : '—', url: u ? (/^https?:/.test(u) ? u : 'https://' + u) : '', why: '', fits: '' }; this.save({ wish: S.addTop ? [item, ...S.wish] : [...S.wish, item], nName: '', nPrice: '', nUrl: '' }); this.flash(S.addTop ? 'Added as #1' : 'Added at #' + (S.wish.length + 1)); }
  renderVals() {
    const S = this.state; const price = (p) => parseFloat(String(p).replace(/[^0-9.]/g, '')) || 0; const C = S.cur || '$'; const money = (n) => C + Math.round(n).toLocaleString('en-AU'); const fmt = (p) => (p && p !== '—' ? C + String(p).replace(/^[^0-9]+/, '') : '—');
    const move = (from, to) => { if (to < 0 || to >= S.wish.length || from === to) return; const w = [...S.wish]; const [x] = w.splice(from, 1); w.splice(to, 0, x); this.save({ wish: w }); };
    const setW = (i, p) => this.save({ wish: S.wish.map((w, j) => (j === i ? { ...w, ...p } : w)) });
    const setI = (idx, p) => this.save({ items: S.items.map((it, j) => (j === idx ? { ...it, ...p } : it)) });
    const maxUsed = Math.max(1, ...S.items.map((x) => x.used || 0));
    const ar = S.arrange || 'system';
    const indexed = S.items.map((it, idx) => ({ ...it, idx }));
    const row = (it, lead) => ({ sepShow: 'inline', name: it.name, lead: lead || '', type: it.type, isBody: it.type === 'Body', isLens: it.type === 'Lens', isFilm: it.type === 'Film', isLight: it.type === 'Light', isApp: it.type === 'App', isOther: !['Body', 'Lens', 'Film', 'Light', 'App'].includes(it.type), used: it.used ? it.used.toLocaleString('en-AU') : '—', pct: Math.round(((it.used || 0) / maxUsed) * 100) + '%',
      typeTitle: { Body: 'Camera', Lens: 'Lens', Film: 'Film', Light: 'Light & meter', App: 'App', Other: 'Other' }[it.type] || 'Other', meta: [ar !== 'type' ? ({ Body: 'Camera', Lens: 'Lens', Film: 'Film', Light: 'Meter', App: 'App', Other: 'Other' }[it.type] || '') : '', ar !== 'system' && it.system !== 'Tools' ? it.system : '', it.note].filter(Boolean).join(' · '),
      year: it.year ? String(it.year) : '', onYear: (e) => setI(it.idx, { year: +e.target.value.replace(/[^0-9]/g, '').slice(0, 4) || 0 }),
      onName: (e) => setI(it.idx, { name: e.target.value }), cycle: () => setI(it.idx, { type: this.TYPES[(this.TYPES.indexOf(it.type) + 1) % this.TYPES.length] }), remove: () => this.save({ items: S.items.filter((_, j) => j !== it.idx) }) });
    let groups = [];
    if (ar === 'type') groups = this.TYPES.map((t) => ({ title: this.TYPE_TITLE[t], list: indexed.filter((x) => x.type === t), add: { type: t, system: 'Other' } })).filter((g) => g.list.length).map((g) => ({ ...g, sub: g.list.length + ' · ' + money(0).replace(C + '0', '') + g.list.reduce((t, x) => t + (x.used || 0), 0).toLocaleString('en-AU') + ' photos' }));
    else if (ar === 'system') { const order = [...new Set(indexed.map((x) => x.system))]; groups = order.map((s) => { const list = indexed.filter((x) => x.system === s).sort((a, b) => (a.type === 'Body' ? -1 : 0) - (b.type === 'Body' ? -1 : 0)); const bodies = list.filter((x) => x.type === 'Body').length, lenses = list.filter((x) => x.type === 'Lens').length; return { title: s, list, sub: s === 'Tools' ? list.length + ' apps' : bodies + (bodies === 1 ? ' body · ' : ' bodies · ') + lenses + (lenses === 1 ? ' lens' : ' lenses'), add: { type: 'Lens', system: s } }; }); }
    else if (ar === 'used') groups = [{ title: 'By photos taken', sub: 'from camera and lens data in your library', list: indexed.filter((x) => x.used).sort((a, b) => b.used - a.used), add: null, bars: true, lead: true }, { title: 'Not in any photos', sub: 'apps, or nothing matched yet', list: indexed.filter((x) => !x.used), add: { type: 'App', system: 'Tools' } }];
    else { const dec = [...new Set(indexed.filter((x) => x.year).map((x) => Math.floor(x.year / 10) * 10))].sort(); groups = [...dec.map((d) => ({ title: d + 's', sub: '', list: indexed.filter((x) => x.year && Math.floor(x.year / 10) * 10 === d).sort((a, b) => a.year - b.year), add: null, lead: true })), { title: 'Apps & tools', sub: '', list: indexed.filter((x) => !x.year), add: { type: 'App', system: 'Tools' } }].filter((g) => g.list.length).map((g) => ({ ...g, sub: g.sub || g.list.length + (g.list.length === 1 ? ' item' : ' items') })); }
    const owned = groups.map((g) => ({ title: g.title, sub: g.sub, titleLocked: ar !== 'system', titleHint: ar === 'system' ? 'Click to rename' : '', onTitle: (e) => ar === 'system' && this.save({ items: S.items.map((x) => x.system === g.title ? { ...x, system: e.target.value } : x) }), barShow: g.bars ? 'flex' : 'none', leadShow: g.lead ? 'block' : 'none',
      cols: (g.lead ? '44px ' : '') + 'minmax(0,1fr) ' + (g.bars ? '200px ' : '') + 'auto 20px',
      items: g.list.map((it, k) => row(it, ar === 'used' ? '#' + (k + 1) : ar === 'year' ? String(it.year || '') : '')),
      addShow: g.add ? 'block' : 'none', addTileShow: g.add ? 'flex' : 'none', addLabel: g.add ? (g.add.system !== 'Other' && g.add.system !== 'Tools' ? 'to ' + g.title : g.title.toLowerCase().replace(/s$/, '')) : '',
      add: () => g.add && this.save({ items: [...S.items, { name: '', type: g.add.type, brand: '', system: g.add.system, year: 0, used: 0, note: '' }] }) }));
    const FOUND = [['Fujifilm X-T5', '12,400 photos'], ['Nikon FM2', '1,820 scans']].filter(([n]) => !S.items.some((it) => it.name === n));
    const okNew = S.nName.trim().length > 1; const total = S.wish.reduce((t, w) => t + price(w.price), 0);
    return {
      syncLabel: S.syncing ? 'Syncing to portfolio…' : 'Synced to photography.trent.au',
      wishMeta: S.wish.length + (S.wish.length === 1 ? ' item' : ' items') + ' · drag or use the arrows to set priority',
      wishEmpty: !S.wish.length, wishTotal: money(total), wishTop: fmt(S.wish[0] && S.wish[0].price),
      wishMore: S.wish.length > 6, wishMoreLabel: S.wishAll ? 'Show top 6' : 'Show all ' + S.wish.length, toggleWishAll: () => this.setState({ wishAll: !S.wishAll }),
      wish: S.wish.slice(0, S.wishAll ? 999 : 6).map((w, i, arr) => { let host = w.url || ''; try { host = new URL(w.url).hostname.replace(/^www\./, ''); } catch (e) {} const top = i === 0; return {
        n: i + 1, name: w.name || '', why: w.why || '', price: fmt(w.price), url: w.url || '#', host: host || 'Add a link', fits: w.fits || '', fitsShow: w.fits ? 'inline' : 'none',
        nameFont: top ? '500' : '400', numFg: top ? '#efede8' : '#6f6c67', border: i < arr.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none', whyPh: w.fits || 'Why you want it', 
        bg: top ? '#1e1e1d' : '#161615', ring: top ? 'inset 0 0 0 1px rgba(255,255,255,.14)' : 'none', op: S.dragI === i ? 0.5 : 1,
        onName: (e) => setW(i, { name: e.target.value }), onWhy: (e) => setW(i, { why: e.target.value }),
        up: () => move(i, i - 1), down: () => move(i, i + 1), upFg: i ? '#a8a59f' : '#3a3936', downFg: i < S.wish.length - 1 ? '#a8a59f' : '#3a3936',
        remove: () => this.save({ wish: S.wish.filter((_, j) => j !== i) }),
        bought: () => { const sysGuess = /leica|summitar|elmar|industar 6/i.test(w.name + ' ' + (w.fits || '')) ? 'Leica screw mount' : /minolta|xd/i.test(w.name + ' ' + (w.fits || '')) ? 'Minolta MD' : /pentax|6×7|6x7/i.test(w.name + ' ' + (w.fits || '')) ? 'Pentax 6×7' : /meter|app/i.test(w.name) ? 'Tools' : '__new'; this.setState({ b: { i, name: w.name, type: /meter/i.test(w.name) ? 'Light' : /mm|lens|summitar/i.test(w.name) ? 'Lens' : /grip|strap|bag/i.test(w.name) ? 'Other' : 'Body', system: sysGuess, sysName: sysGuess === '__new' ? w.name.split(' ').slice(0, 2).join(' ') : '', paid: w.price && w.price !== '—' ? w.price : '', year: '', guessed: sysGuess !== '__new' } }); },
        dragStart: (e) => { e.dataTransfer.setData('text/plain', String(i)); this.setState({ dragI: i }); }, dragOver: (e) => e.preventDefault(), drop: (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); this.setState({ dragI: null }); move(from, i); }, dragEnd: () => this.setState({ dragI: null }),
      }; }),
      curOpts: ['$', '€', '£', '¥', '₹', 'kr', 'CHF'].map((c) => ({ label: c, bg: C === c ? '#efede8' : 'transparent', fg: C === c ? '#0d0d0d' : '#a8a59f', pick: () => { this.save({ cur: c }); this.flash('Prices shown in ' + c); } })),
      showHint: S.showWish ? 'Shown below your gear, in this order' : 'Only you can see this list',
      showTrack: S.showWish ? '#efede8' : 'rgba(255,255,255,.14)', showKnob: S.showWish ? '21px' : '3px', showKnobBg: S.showWish ? '#0d0d0d' : '#a8a59f',
      toggleShow: () => { this.save({ showWish: !S.showWish }); this.flash(S.showWish ? 'Hidden from your portfolio' : 'Shown on your portfolio'); },
      nName: S.nName, nPrice: S.nPrice, nUrl: S.nUrl, onNName: (e) => this.setState({ nName: e.target.value }), onNPrice: (e) => this.setState({ nPrice: e.target.value }), onNUrl: (e) => this.setState({ nUrl: e.target.value }), addOp: okNew ? 1 : 0.4,
      addAt: [[true, 'As #1'], [false, 'At the end']].map(([v, label]) => ({ label, bg: S.addTop === v ? '#efede8' : 'transparent', fg: S.addTop === v ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ addTop: v }) })),
      addKey: (e) => { if (e.key === 'Enter') this.addNow(); },
      addWish: () => this.addNow(),
      addNewLabel: ar === 'system' ? 'New system' : 'New item',
      addNew: () => { let sys = 'New system', k = 2; while (S.items.some((x) => x.system === sys)) sys = 'New system ' + k++; this.save({ items: [...S.items, { name: '', type: 'Body', brand: '', system: ar === 'system' ? sys : 'Other', year: 0, used: 0, note: '' }] }); this.flash(ar === 'system' ? 'Added a system · name the body to start it' : 'Added · give it a name'); },
      ownMeta: S.items.length + ' items · ' + S.items.filter((x) => x.type === 'Body').length + ' cameras · ' + S.items.filter((x) => x.type === 'Lens').length + ' lenses',
      arranges: [['system', 'System', 'Bodies with the lenses that fit them'], ['type', 'Type', 'Cameras, lenses, tools'], ['used', 'Most used', 'From the camera data in your photos'], ['year', 'Era', 'By the year it was made']].map(([k, label, hint]) => ({ label, hint, bg: ar === k ? '#efede8' : 'transparent', fg: ar === k ? '#0d0d0d' : '#a8a59f', go: () => this.save({ arrange: k }) })),
      arrangeHint: { system: 'Bodies first, then the lenses that fit · your portfolio uses this too', type: 'Grouped by what it is · your portfolio uses this too', used: 'Counted from camera and lens data in your photos', year: 'Oldest first · your portfolio uses this too' }[ar],
      ownCols: ar === 'used' ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', owned,
      intro: S.intro, onIntro: (e) => this.save({ intro: e.target.value }),
      hasFound: FOUND.length > 0, found: FOUND.map(([name, n]) => ({ name, n, add: () => { this.save({ items: [{ name, type: 'Body', brand: '', system: name.includes('Fuji') ? 'Fujifilm X' : 'Nikon F', year: name.includes('Fuji') ? 2022 : 1982, used: parseInt(n.replace(/,/g, '')), note: '' }, ...S.items] }); this.flash(name + ' added · found in ' + n); } })),
      ...(() => { const B = S.b; if (!B) return { bOpen: false }; const setB = (p) => this.setState((s) => ({ b: { ...s.b, ...p } })); const systems = [...new Set(S.items.map((x) => x.system))]; const sys = B.system === '__new' ? B.sysName.trim() : B.system; const ok = B.name.trim() && sys;
        return { bOpen: true, bClose: () => this.setState({ b: null }), bStop: (e) => e.stopPropagation(),
          bName: B.name, bOnName: (e) => setB({ name: e.target.value }), bPaid: B.paid, bOnPaid: (e) => setB({ paid: e.target.value }), bYear: B.year, bOnYear: (e) => setB({ year: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }),
          bTypes: this.TYPES.map((t) => ({ label: this.TYPE_TITLE[t].replace(/s$/, '').replace('Light & meter', 'Light & meter'), bg: B.type === t ? '#efede8' : 'transparent', fg: B.type === t ? '#0d0d0d' : '#a8a59f', ring: B.type === t ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.18)', go: () => setB({ type: t }) })),
          bSystems: [...systems, '__new'].map((sy) => ({ label: sy === '__new' ? '+ New system' : sy, bg: B.system === sy ? '#efede8' : 'transparent', fg: B.system === sy ? '#0d0d0d' : '#a8a59f', ring: B.system === sy ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.18)', go: () => setB({ system: sy }) })),
          bNewSys: B.system === '__new', bSysName: B.sysName, bOnSysName: (e) => setB({ sysName: e.target.value }), bSysHint: B.guessed ? '✦ Suggested from what it fits' : 'Pick where it belongs',
          bFoot: sys ? 'Goes under ' + sys + ' · ' + this.TYPE_TITLE[B.type].toLowerCase() : 'Name the new system', bGoOp: ok ? 1 : 0.4,
          bGo: () => { if (!ok) return; const paid = B.paid.trim(); this.save({ wish: S.wish.filter((_, j) => j !== B.i), items: [...S.items, { name: B.name.trim(), type: B.type, brand: '', system: sys, year: +B.year || 0, used: 0, note: 'Bought ' + new Date().toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) + (paid ? ' · ' + ((S.cur || '$') + paid.replace(/^[^0-9]+/, '')) : '') }], b: null, arrange: 'system' }); this.flash(B.name.trim() + ' added under ' + sys); } }; })(),
      toast: S.toast || '', toastOp: S.tOp || 0,
    };
  }
}
