/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Gear.dc.html. Behaviour is the spec; the gear, the wishlist and every change come in
// through props (see screens/Gear.tsx). Each item: { id, name, type: 'Body'|'Lens'|'Film'|'Light'|'App'|'Other', system, year, used, note }.
// Each wish: { id, name, price (number|null), url, why, fits }.
import { DCLogic } from './runtime';
import { addShortcuts } from '../components/shortcuts';

export class Logic extends DCLogic {
  TYPES = ['Body', 'Lens', 'Film', 'Light', 'App', 'Other'];
  TYPE_TITLE = { Body: 'Cameras', Lens: 'Lenses', Film: 'Film', Light: 'Light & meters', App: 'Apps & tools', Other: 'Other' };
  state = { nName: '', nPrice: '', nUrl: '', addTop: false, dragI: null, wishAll: false, b: null, sysEdit: null, toast: '', tOp: 0, syncing: false };
  componentDidMount() { this.offKeys = addShortcuts(() => [{ key: 'n', label: (this.props.arrange || 'system') === 'system' ? 'New system' : 'New item', run: () => this.addNewNow?.() }]); }
  componentWillUnmount() { this.offKeys?.(); clearTimeout(this.tT); clearTimeout(this.sT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2000); }
  async act(fn) { this.setState({ syncing: true }); try { await fn(); } finally { clearTimeout(this.sT); this.sT = setTimeout(() => this.setState({ syncing: false }), 500); } }
  addNow() {
    const S = this.state, P = this.props; if (S.nName.trim().length < 2) return;
    const u = S.nUrl.trim(); const price = S.nPrice.trim().replace(/[^0-9.]/g, '');
    this.act(() => P.onAddWish({ name: S.nName.trim(), price: price || null, link: u ? (/^https?:/.test(u) ? u : 'https://' + u) : '', front: S.addTop }));
    this.setState({ nName: '', nPrice: '', nUrl: '' }); this.flash(S.addTop ? 'Added as #1' : 'Added at #' + (P.wish.length + 1));
  }
  renderVals() {
    const S = this.state, P = this.props;
    const items = P.items || [], wish = P.wish || [];
    const C = P.currency || '$';
    const money = (n) => C + Math.round(n).toLocaleString('en-AU');
    const fmt = (p) => (p != null && p !== '' ? C + Math.round(p).toLocaleString('en-AU') : '—');
    const move = (from, to) => { if (to < 0 || to >= wish.length || from === to) return; const ids = wish.map((w) => w.id); const [x] = ids.splice(from, 1); ids.splice(to, 0, x); this.act(() => P.onOrder(ids)); };
    const maxUsed = Math.max(1, ...items.map((x) => x.used || 0));
    const ar = P.arrange || 'system';
    const row = (it, lead) => ({ sepShow: 'inline', name: it.name, lead: lead || '', type: it.type, isBody: it.type === 'Body', isLens: it.type === 'Lens', isFilm: it.type === 'Film', isLight: it.type === 'Light', isApp: it.type === 'App', isOther: !['Body', 'Lens', 'Film', 'Light', 'App'].includes(it.type), used: it.used ? it.used.toLocaleString('en-AU') : '—', pct: Math.round(((it.used || 0) / maxUsed) * 100) + '%',
      typeTitle: { Body: 'Camera', Lens: 'Lens', Film: 'Film', Light: 'Light & meter', App: 'App', Other: 'Other' }[it.type] || 'Other', meta: [ar !== 'type' ? ({ Body: 'Camera', Lens: 'Lens', Film: 'Film', Light: 'Meter', App: 'App', Other: 'Other' }[it.type] || '') : '', ar !== 'system' ? it.system : '', it.note].filter(Boolean).join(' · '),
      year: it.year ? String(it.year) : '', onYear: (e) => this.act(() => P.onItem(it.id, { year: +e.target.value.replace(/[^0-9]/g, '').slice(0, 4) || null })),
      serial: it.serial || '', onSerial: (e) => P.onItemSerial(it.id, e.target.value),
      onName: (e) => P.onItemName(it.id, e.target.value), cycle: () => this.act(() => P.onItem(it.id, { type: this.TYPES[(this.TYPES.indexOf(it.type) + 1) % this.TYPES.length] })), remove: () => this.act(() => P.onRemoveItem(it.id)) });
    const indexed = items;
    let groups = [];
    if (ar === 'type') groups = this.TYPES.map((t) => ({ title: this.TYPE_TITLE[t], list: indexed.filter((x) => x.type === t), add: { type: t, system: 'Other' } })).filter((g) => g.list.length).map((g) => ({ ...g, sub: g.list.length + ' · ' + g.list.reduce((t, x) => t + (x.used || 0), 0).toLocaleString('en-AU') + ' photos' }));
    else if (ar === 'system') { const order = [...new Set(indexed.map((x) => x.system || 'Other'))]; groups = order.map((sy) => { const list = indexed.filter((x) => (x.system || 'Other') === sy).sort((a, b) => (a.type === 'Body' ? -1 : 0) - (b.type === 'Body' ? -1 : 0)); const bodies = list.filter((x) => x.type === 'Body').length, lenses = list.filter((x) => x.type === 'Lens').length; return { title: sy, list, sub: sy === 'Tools' ? list.length + ' apps' : bodies + (bodies === 1 ? ' body · ' : ' bodies · ') + lenses + (lenses === 1 ? ' lens' : ' lenses'), add: { type: 'Lens', system: sy } }; }); }
    else if (ar === 'used') groups = [{ title: 'By photos taken', sub: 'from camera and lens data in your library', list: indexed.filter((x) => x.used).sort((a, b) => b.used - a.used), add: null, bars: true, lead: true }, { title: 'Not in any photos', sub: 'apps, or nothing matched yet', list: indexed.filter((x) => !x.used), add: { type: 'App', system: 'Tools' } }].filter((g) => g.list.length || g.add);
    else { const dec = [...new Set(indexed.filter((x) => x.year).map((x) => Math.floor(x.year / 10) * 10))].sort(); groups = [...dec.map((d) => ({ title: d + 's', sub: '', list: indexed.filter((x) => x.year && Math.floor(x.year / 10) * 10 === d).sort((a, b) => a.year - b.year), add: null, lead: true })), { title: 'Undated', sub: '', list: indexed.filter((x) => !x.year), add: { type: 'App', system: 'Tools' } }].filter((g) => g.list.length).map((g) => ({ ...g, sub: g.sub || g.list.length + (g.list.length === 1 ? ' item' : ' items') })); }
    const E = S.sysEdit;
    const owned = groups.map((g) => ({ title: E && E.from === g.title ? E.to : g.title, sub: g.sub, titleLocked: ar !== 'system', titleHint: ar === 'system' ? 'Click to rename' : '',
      onTitle: (e) => ar === 'system' && this.setState({ sysEdit: { from: g.title, to: e.target.value } }),
      onTitleBlur: () => { if (E && E.from === g.title) { const to = E.to.trim(); this.setState({ sysEdit: null }); if (to && to !== g.title) this.act(() => P.onRenameSystem(g.title, to)); else this.setState({ sysEdit: null }); } },
      barShow: g.bars ? 'flex' : 'none', leadShow: g.lead ? 'block' : 'none',
      cols: (g.lead ? '44px ' : '') + 'minmax(0,1fr) ' + (g.bars ? '200px ' : '') + 'auto 20px',
      items: g.list.map((it, k) => row(it, ar === 'used' ? '#' + (k + 1) : ar === 'year' ? String(it.year || '') : '')),
      addShow: g.add ? 'block' : 'none', addTileShow: g.add ? 'flex' : 'none', addLabel: g.add ? (g.add.system !== 'Other' && g.add.system !== 'Tools' ? 'to ' + g.title : g.title.toLowerCase().replace(/s$/, '')) : '',
      add: () => g.add && this.act(() => P.onAddItem({ name: g.add.type === 'Body' ? 'New camera body' : 'New ' + this.TYPE_TITLE[g.add.type].toLowerCase().replace(/s$/, ''), type: g.add.type, system: g.add.system })) }));
    const FOUND = (P.found || []);
    const okNew = S.nName.trim().length > 1; const total = wish.reduce((t, w) => t + (w.price || 0), 0);
    return {
      syncLabel: S.syncing ? 'Syncing to portfolio…' : P.syncLabel,
      wishMeta: wish.length + (wish.length === 1 ? ' item' : ' items') + ' · drag or use the arrows to set priority',
      wishEmpty: !wish.length, wishTotal: money(total), wishTop: fmt(wish[0] && wish[0].price),
      wishMore: wish.length > 6, wishMoreLabel: S.wishAll ? 'Show top 6' : 'Show all ' + wish.length, toggleWishAll: () => this.setState({ wishAll: !S.wishAll }),
      wish: wish.slice(0, S.wishAll ? 999 : 6).map((w, i, arr) => { let host = w.url || ''; try { host = new URL(w.url).hostname.replace(/^www\./, ''); } catch (e) {} const top = i === 0; return {
        n: i + 1, name: w.name || '', why: w.why || '', price: fmt(w.price), url: w.url || '#', host: host || 'Add a link', fits: w.fits || '', fitsShow: w.fits ? 'inline' : 'none',
        nameFont: top ? '500' : '400', numFg: top ? 'var(--text)' : 'var(--faint)', border: i < arr.length - 1 ? '1px solid var(--hover)' : 'none', whyPh: w.fits || 'Why you want it',
        bg: top ? 'var(--raised2)' : 'var(--surface)', ring: top ? 'inset 0 0 0 1px color-mix(in srgb, var(--text) 14%, transparent)' : 'none', op: S.dragI === i ? 0.5 : 1,
        onName: (e) => P.onWishText(w.id, { name: e.target.value }), onWhy: (e) => P.onWishText(w.id, { why: e.target.value }),
        up: () => move(i, i - 1), down: () => move(i, i + 1), upFg: i ? 'var(--text2)' : '#3a3936', downFg: i < wish.length - 1 ? 'var(--text2)' : '#3a3936',
        remove: () => this.act(() => P.onRemoveItem(w.id)),
        bought: () => { const sysGuess = P.guessSystem(w); this.setState({ b: { id: w.id, name: w.name, type: P.guessType(w), system: sysGuess || '__new', sysName: sysGuess ? '' : w.name.split(' ').slice(0, 2).join(' '), paid: w.price != null ? String(Math.round(w.price)) : '', year: '', guessed: !!sysGuess } }); },
        dragStart: (e) => { e.dataTransfer.setData('text/plain', String(i)); this.setState({ dragI: i }); }, dragOver: (e) => e.preventDefault(), drop: (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); this.setState({ dragI: null }); move(from, i); }, dragEnd: () => this.setState({ dragI: null }),
      }; }),
      curOpts: ['$', '€', '£', '¥', '₹', 'kr', 'CHF'].map((c) => ({ label: c, bg: C === c ? 'var(--text)' : 'transparent', fg: C === c ? 'var(--bg)' : 'var(--text2)', pick: () => { this.act(() => P.onPrefs({ currency: c })); this.flash('Prices shown in ' + c); } })),
      showHint: P.showWish ? 'Shown below your gear, in this order' : 'Only you can see this list',
      showTrack: P.showWish ? 'var(--text)' : 'color-mix(in srgb, var(--text) 14%, transparent)', showKnob: P.showWish ? '21px' : '3px', showKnobBg: P.showWish ? 'var(--bg)' : 'var(--text2)',
      toggleShow: () => { this.act(() => P.onPrefs({ showWant: !P.showWish })); this.flash(P.showWish ? 'Hidden from your portfolio' : 'Shown on your portfolio'); },
      nName: S.nName, nPrice: S.nPrice, nUrl: S.nUrl, onNName: (e) => this.setState({ nName: e.target.value }), onNPrice: (e) => this.setState({ nPrice: e.target.value }), onNUrl: (e) => this.setState({ nUrl: e.target.value }), addOp: okNew ? 1 : 0.4,
      addAt: [[true, 'As #1'], [false, 'At the end']].map(([v, label]) => ({ label, bg: S.addTop === v ? 'var(--text)' : 'transparent', fg: S.addTop === v ? 'var(--bg)' : 'var(--text2)', go: () => this.setState({ addTop: v }) })),
      addKey: (e) => { if (e.key === 'Enter') this.addNow(); },
      addWish: () => this.addNow(),
      addNewLabel: ar === 'system' ? 'New system' : 'New item',
      addNew: this.addNewNow = () => { let sys = 'New system', k = 2; while (items.some((x) => x.system === sys)) sys = 'New system ' + k++; this.act(() => P.onAddItem({ name: ar === 'system' ? 'New camera body' : 'New item', type: ar === 'system' ? 'Body' : 'Other', system: ar === 'system' ? sys : 'Other' })); this.flash(ar === 'system' ? 'Added a system · name the body to start it' : 'Added · give it a name'); },
      ownMeta: items.length + ' items · ' + items.filter((x) => x.type === 'Body').length + ' cameras · ' + items.filter((x) => x.type === 'Lens').length + ' lenses',
      arranges: [['system', 'System', 'Bodies with the lenses that fit them'], ['type', 'Type', 'Cameras, lenses, tools'], ['used', 'Most used', 'From the camera data in your photos'], ['year', 'Era', 'By the year it was made']].map(([k, label, hint]) => ({ label, hint, bg: ar === k ? 'var(--text)' : 'transparent', fg: ar === k ? 'var(--bg)' : 'var(--text2)', go: () => this.act(() => P.onPrefs({ arrange: k === 'year' ? 'era' : k })) })),
      arrangeHint: { system: 'Bodies first, then the lenses that fit · your portfolio uses this too', type: 'Grouped by what it is · your portfolio uses this too', used: 'Counted from camera and lens data in your photos', year: 'Oldest first · your portfolio uses this too' }[ar],
      ownCols: ar === 'used' ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))', owned,
      intro: P.intro, onIntro: (e) => P.onIntro(e.target.value),
      hasFound: FOUND.length > 0, found: FOUND.map((f) => ({ name: f.name, n: f.n, add: () => { this.act(() => P.onAddItem({ name: f.name, type: f.type })); this.flash(f.name + ' added · found in ' + f.n); } })),
      ...(() => { const B = S.b; if (!B) return { bOpen: false }; const setB = (p) => this.setState((s) => ({ b: { ...s.b, ...p } })); const systems = [...new Set(items.map((x) => x.system || 'Other'))]; const sys = B.system === '__new' ? B.sysName.trim() : B.system; const ok = B.name.trim() && sys;
        return { bOpen: true, bClose: () => this.setState({ b: null }), bStop: (e) => e.stopPropagation(),
          bName: B.name, bOnName: (e) => setB({ name: e.target.value }), bPaid: B.paid, bOnPaid: (e) => setB({ paid: e.target.value }), bYear: B.year, bOnYear: (e) => setB({ year: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) }),
          bTypes: this.TYPES.map((t) => ({ label: this.TYPE_TITLE[t].replace(/s$/, ''), bg: B.type === t ? 'var(--text)' : 'transparent', fg: B.type === t ? 'var(--bg)' : 'var(--text2)', ring: B.type === t ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent)', go: () => setB({ type: t }) })),
          bSystems: [...systems, '__new'].map((sy) => ({ label: sy === '__new' ? '+ New system' : sy, bg: B.system === sy ? 'var(--text)' : 'transparent', fg: B.system === sy ? 'var(--bg)' : 'var(--text2)', ring: B.system === sy ? 'none' : 'inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent)', go: () => setB({ system: sy }) })),
          bNewSys: B.system === '__new', bSysName: B.sysName, bOnSysName: (e) => setB({ sysName: e.target.value }), bSysHint: B.guessed ? '✦ Suggested from what it fits' : 'Pick where it belongs',
          bFoot: sys ? 'Goes under ' + sys + ' · ' + this.TYPE_TITLE[B.type].toLowerCase() : 'Name the new system', bGoOp: ok ? 1 : 0.4,
          bGo: () => { if (!ok) return; const paid = B.paid.trim().replace(/[^0-9.]/g, ''); this.act(() => P.onBought(B.id, { name: B.name.trim(), type: B.type, system: sys, year: +B.year || null, paid: paid || null })); this.setState({ b: null }); this.flash(B.name.trim() + ' added under ' + sys); } }; })(),
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
