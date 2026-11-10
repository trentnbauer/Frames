/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Portfolio.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  THEME_KEY = 'photo-portfolio-theme';
  state = (() => { let t = 'dark'; try { t = localStorage.getItem('photo-portfolio-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {} return { dark: t === 'dark', view: 'index', lb: null, gear: this.readGear() }; })();
  readGear() {
    let g = null; try { const v2 = JSON.parse(localStorage.getItem('frames-gear2')); if (v2 && v2.items) { const T = { Body: 'Cameras', Lens: 'Lenses', Film: 'Film', Light: 'Light & meters', App: 'Apps & tools', Other: 'Other' }; const ar = v2.arrange === 'used' ? 'type' : v2.arrange || 'system'; const key = (x) => (ar === 'type' ? T[x.type] : ar === 'year' ? (x.year ? Math.floor(x.year / 10) * 10 + 's' : 'Apps & tools') : x.system); const items = ar === 'year' ? [...v2.items].sort((a, b) => (a.year || 9999) - (b.year || 9999)) : v2.items; const names = [...new Set(items.filter((x) => (x.name || '').trim()).map(key))]; g = { intro: v2.intro, showWish: v2.showWish, wish: (v2.wish || []).map((w) => [w.name, w.price && w.price !== '—' ? (v2.cur || '$') + String(w.price).replace(/^[^0-9]+/, '') : '—', w.url]), groups: names.map((n) => ({ title: n, items: items.filter((x) => key(x) === n && (x.name || '').trim()).map((x) => [x.name, x.type, [ar === 'year' && x.year ? x.year : '', x.note].filter(Boolean).join(' · ')]) })) }; } } catch (e) {}
    if (!g) try { g = JSON.parse(localStorage.getItem('frames-gear')); } catch (e) {}
    return g || { intro: 'Old Minoltas, a Leica and a couple of Soviet bodies. Mostly manual, all older than me.', groups: [{ title: 'Minolta', items: [['Early Minolta XD', 'Body', ''], ['MD 50mm f1.7', 'Lens', ''], ['MD Tele Rokkor 135mm f2.8', 'Lens', '']] }, { title: 'Leitz', items: [['1951 Leica IIIc', 'Body', ''], ['Elmar 3.5 (red scale)', 'Lens', '']] }, { title: 'Pentax', items: [['Pentax 6x7, non-MLU', 'Body', ''], ['SMC Takumar 150mm f2.8', 'Lens', '']] }, { title: 'Tools', items: [['FilmCalc', 'App', 'Price of shooting film · filmcalc.app'], ['Light Meter', 'App', 'For the cameras without a built-in meter']] }], wish: [['Mamiya 7 II + 80mm f4', '$3,400', 'https://www.ebay.com.au'], ['Leica Summitar 50mm f2', '$380', 'https://www.ebay.com.au'], ['Sekonic L-308X light meter', '$310', 'https://www.camerahouse.com.au']], showWish: true };
  }
  componentDidMount() { this.onCountry = (e) => this.setState({ country: e.detail }); window.addEventListener('frames-country', this.onCountry); this.onStore = (e) => { if (e.key === 'frames-gear' || e.key === 'frames-gear2') this.setState({ gear: this.readGear() }); }; window.addEventListener('storage', this.onStore); }
  componentWillUnmount() { window.removeEventListener('storage', this.onStore); }
  toggle() {
    const next = !this.state.dark; try { localStorage.setItem(this.THEME_KEY, next ? 'dark' : 'light'); } catch (e) {}
    const apply = () => new Promise((r) => this.setState({ dark: next }, r));
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { apply(); return; }
    const t = document.startViewTransition(apply);
    t.ready.then(() => { document.documentElement.animate({ clipPath: ['polygon(0 0, 0% 0, -35% 100%, 0 100%)', 'polygon(0 0, 135% 0, 100% 100%, 0 100%)'] }, { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)', pseudoElement: '::view-transition-new(root)' }); }).catch(() => {});
  }
  renderVals() {
    const S = this.state; const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const ph = (n) => ({ src: `photos/p${n}.jpg`, ar: AR[n - 1], flex: `${AR[n - 1]} ${AR[n - 1]} ${Math.round(AR[n - 1] * 330)}px`, open: () => this.setState({ lb: n }) });
    const idx = [5, 9, 2, 7, 1, 10, 3, 4, 8, 6, 5, 9].map(ph); const fav = [9, 7, 3, 10].map(ph);
    const nav = [['Index', 'index'], ['Favourites', 'fav'], ['Gear', 'gear'], ['Instagram ↗', 'ext'], ['eBay ↗', 'ext'], ['Resume ↗', 'ext'], ['FilmCalc ↗', 'ext']];
    const fg = S.dark ? '#ece9e4' : '#141412'; const G = S.gear;
    const groups = (G.groups || []).map((g) => ({ ...g, items: g.items.filter((it) => (it[0] || '').trim()) })).filter((g) => g.items.length);
    const unit = (items) => { const t = items.map((i) => (i[1] || '').toLowerCase()); const u = t.every((x) => x === 'app') ? ['app', 'apps'] : ['piece', 'pieces']; return items.length + ' ' + u[items.length === 1 ? 0 : 1]; };
    return { country: this.state.country || (() => { try { return localStorage.getItem('frames-country') || 'Australia'; } catch (e) { return 'Australia'; } })(),
      pBg: S.dark ? '#0d0c0b' : '#f4f2ec', pFg: fg, pLine: S.dark ? 'color-mix(in srgb, var(--text) 15%, transparent)' : 'rgba(0,0,0,.15)',
      themeLabel: S.dark ? 'Light' : 'Dark', themeIcon: S.dark ? '☼' : '☾', toggleTheme: () => this.toggle(),
      pNav: nav.map(([label, k]) => ({ label, line: k === S.view ? `1.5px solid ${fg}` : '1.5px solid transparent', go: () => (k === 'ext' ? null : this.setState({ view: k, gear: k === 'gear' ? this.readGear() : S.gear })) })),
      isGrid: S.view !== 'gear', isGear: S.view === 'gear', pGrid: S.view === 'fav' ? fav : idx,
      gIntro: G.intro || '', gGroups: groups.map((g) => ({ title: g.title, count: unit(g.items), items: g.items.map(([name, tag, note]) => ({ name, tag, note: note || '', noteShow: note ? 'block' : 'none' })) })),
      showWish: !!G.showWish && (G.wish || []).length > 0, wishCount: (G.wish || []).length + ' wanted', wish: (G.wish || []).map(([name, price, url], i) => ({ n: String(i + 1).padStart(2, '0'), name, price, url: url || '#' })),
      lightbox: !!S.lb, lbSrc: S.lb ? `photos/p${S.lb}.jpg` : '', closeLb: () => this.setState({ lb: null }),
    };
  }
}
