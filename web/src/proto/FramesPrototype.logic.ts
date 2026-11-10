/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Frames Prototype.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  SCREENS = [
    ['In the app', [['home', 'Home'], ['shoots', 'Photoshoots'], ['library', 'Library'], ['search', 'Search'], ['photo', 'Photo'], ['review', 'Review'], ['community', 'Community review'], ['compositions', 'Compositions'], ['editor', 'Composition editor'], ['gear', 'Gear & wishlist'], ['settings', 'Settings'], ['server', 'Server settings']]],
    ['More pages', [['stats', 'Stats'], ['todo', 'To do'], ['compare', 'Compare'], ['dupes', 'Near-duplicates'], ['new', 'New composition'], ['welcome', 'Welcome tour']]],
    ['Outside the app', [['share', 'Guest share page'], ['auth', 'Sign in & out'], ['signup', 'Sign up'], ['terms', 'Terms of service'], ['guestlink', 'Share link gate'], ['portfolio', 'Public portfolio']]],
    ['Emails', [['emailcode', 'Sign-in code email'], ['emailgen', 'General email']]],
  ];
  FALLBACK = [
    { name: 'v1.17.0', date: '6 Nov 2026', url: 'https://github.com/trentnbauer/Frames/releases', items: ['Notifications for guest suggestions, community reviews and composition ideas', 'Community review: rate other photographers’ work, anonymously', 'Mark photos as nudity, violence or adult content'] },
    { name: 'v1.16.0', date: '24 Oct 2026', url: 'https://github.com/trentnbauer/Frames/releases', items: ['Gear page with a want-to-buy list, synced to your portfolio', 'Drag prints around the composition wall', 'Fullscreen composition editor'] },
    { name: 'v1.15.0', date: '10 Oct 2026', url: 'https://github.com/trentnbauer/Frames/releases', items: ['Share links with expiry, passwords and email invites', 'Upload straight into a new or existing shoot', 'Theme switch no longer flashes the page'] },
  ];
  keys = this.SCREENS.flatMap(([, it]) => it.map(([k]) => k));
  readHash() { const h = (location.hash || '').slice(1); return this.keys.includes(h) ? h : 'home'; }
  state = (() => { let f = {}; try { f = JSON.parse(localStorage.getItem('frames-proto-flags')) || {}; } catch (e) {} return { screen: this.readHash(), zoom: 1, prof: false, notif: false, uploadReq: 0, read: [], localOn: f.localOn !== false, cloudOn: f.cloudOn !== false, admin: f.admin !== false, envDrift: !!f.envDrift, smtpOn: f.smtpOn !== false, theme: document.documentElement.getAttribute('data-theme') || 'dark', upd: false, rel: null }; })();
  stageRef = React.createRef();
  componentDidMount() {
    this.onHash = () => { const s = this.readHash(); if (s !== this.state.screen) { this.setState({ screen: s }); window.scrollTo(0, 0); } };
    this.onClick = (e) => { for (const el of e.composedPath()) { if (el && el.dataset && el.dataset.go) { this.go(el.dataset.go); break; } } };
    this.onResize = () => { const w = this.stageRef.current ? this.stageRef.current.clientWidth - 48 : 1440; this.setState({ zoom: Math.min(1, Math.max(0.4, w / 1440)) }); };
    this.onTheme = (e) => this.setTheme(e.detail === 'light' ? 'light' : 'dark');
    window.addEventListener('hashchange', this.onHash); document.addEventListener('click', this.onClick); window.addEventListener('resize', this.onResize); window.addEventListener('frames-theme', this.onTheme); this.onResize();
    this.syncDot();
    let shown = false; try { shown = sessionStorage.getItem('frames-upd-shown') === '1'; } catch (e) {}
    if (this.state.admin && !shown) this.openUpd();
  }
  componentWillUnmount() { window.removeEventListener('hashchange', this.onHash); document.removeEventListener('click', this.onClick); window.removeEventListener('resize', this.onResize); window.removeEventListener('frames-theme', this.onTheme); clearTimeout(this.cT); }
  componentDidUpdate() { this.syncDot(); }
  NOTIFS() { return [['n1', 'M', 'Mia suggested 2 changes to Kitchen wall', '2 hours ago', 'editor', 'guests:changes'], ['n2', '★', '3 people in the community rated “Stone wall, gold hour” · 4.4 average', '5 hours ago', 'photo', 'ratings'], ['n3', '✦', 'New composition idea: Autumn & rust · 14 photos from 5 shoots', 'today', 'home', 'ideas'], ['n4', '☁', '46 photos synced from Google Drive · give them a name', 'today', 'home', 'cloud'], ['n5', 'S', 'Sam rated 9 of 12 photos on Kitchen wall', 'yesterday', 'editor', 'guests:ratings'], ['n6', '⚑', 'A community photo you reported was removed. Thanks.', '2 days ago', 'community', 'reports']].filter((n) => this.state.cloudOn || n[0] !== 'n4'); }
  unread() { return this.NOTIFS().filter((n) => ['n1', 'n2', 'n3', 'n4'].includes(n[0]) && !this.state.read.includes(n[0])).length; }
  syncDot() { document.documentElement.setAttribute('data-notifs', String(this.unread())); }
  saveFlags(p) { this.setState(p, () => { try { localStorage.setItem('frames-proto-flags', JSON.stringify({ localOn: this.state.localOn, cloudOn: this.state.cloudOn, admin: this.state.admin, envDrift: this.state.envDrift, smtpOn: this.state.smtpOn })); } catch (e) {} }); }
  setTheme(next) {
    if (next === this.state.theme) return;
    const apply = () => { document.documentElement.setAttribute('data-theme', next); try { localStorage.setItem('frames-theme', next); } catch (e) {} this.setState({ theme: next }); };
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { apply(); return; }
    const t = document.startViewTransition(apply);
    t.ready.then(() => { document.documentElement.animate({ clipPath: ['polygon(0 0, 0% 0, -35% 100%, 0 100%)', 'polygon(0 0, 135% 0, 100% 100%, 0 100%)'] }, { duration: 750, easing: 'cubic-bezier(.7,0,.25,1)', pseudoElement: '::view-transition-new(root)' }); }).catch(() => {});
  }
  async openUpd() {
    try { sessionStorage.setItem('frames-upd-shown', '1'); } catch (e) {}
    this.setState({ upd: true, prof: false, notif: false });
    if (this.state.rel) return;
    try {
      const r = await fetch('https://api.github.com/repos/trentnbauer/Frames/releases?per_page=8', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('http');
      const j = await r.json();
      const clean = (l) => l.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+by @\S+/g, '').replace(/\s+in https:\/\/github\.com\/\S+/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      const rel = j.filter((x) => !x.draft && !x.prerelease).slice(0, 4).map((x) => ({ name: x.name || x.tag_name, date: new Date(x.published_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }), url: x.html_url, items: (x.body || '').split('\n').map((l) => l.trim()).filter((l) => /^[-*]\s+/.test(l)).map(clean).filter(Boolean).slice(0, 6) })).map((x) => (x.items.length ? x : { ...x, items: ['See the release notes on GitHub'] }));
      if (!rel.length) throw new Error('empty');
      this.setState({ rel, relSrc: 'github' });
    } catch (e) { this.setState({ rel: this.FALLBACK, relSrc: 'fallback' }); }
  }
  deep(to, what) {
    window.__framesDeep = { screen: to, what }; window.dispatchEvent(new CustomEvent('frames-deep', { detail: window.__framesDeep }));
    this.go(to); window.scrollTo(0, 0);
    clearTimeout(this.dT); let tries = 0;
    const seek = () => { const el = document.querySelector('[data-anchor="' + what + '"]'); if (el) { const r = el.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, r.top + window.scrollY - 120), behavior: 'smooth' }); const t = el.closest('[data-anchor-box]') || el.parentElement; if (t && t.animate) t.animate([{ boxShadow: '0 0 0 2px oklch(0.72 0.15 45)' }, { boxShadow: '0 0 0 2px transparent' }], { duration: 1800, easing: 'ease-out' }); } else if (++tries < 12) this.dT = setTimeout(seek, 150); };
    this.dT = setTimeout(seek, 200);
  }
  go(k) {
    if (k === 'profile') { this.setState({ prof: !this.state.prof, notif: false }); return; }
    if (k === 'notifs') { this.setState({ notif: !this.state.notif, prof: false }); return; }
    if (k === 'upload') { this.setState({ prof: false, notif: false, uploadReq: this.state.localOn || this.state.cloudOn ? this.state.uploadReq + 1 : 0 }); if (location.hash.slice(1) !== 'shoots') location.hash = 'shoots'; return; }
    this.setState({ prof: false, notif: false, uploadReq: 0 }); if (!this.keys.includes(k)) return; if (location.hash.slice(1) !== k) location.hash = k; else this.setState({ screen: k });
  }
  renderVals() {
    const S = this.state; const cur = S.screen; const i = this.keys.indexOf(cur); let n = 0;
    const flags = {}; for (const k of this.keys) flags['is' + k[0].toUpperCase() + k.slice(1)] = k === cur;
    const tog = (on) => ({ track: on ? '#efede8' : 'rgba(255,255,255,.14)', knob: on ? '15px' : '3px', knobBg: on ? '#0d0d0d' : '#a8a59f' });
    const light = S.theme === 'light'; const stageIsApp = !['share', 'portfolio', 'auth', 'guestlink', 'signup', 'terms', 'emailcode', 'emailgen'].includes(cur); const rels = S.rel || []; const unread = this.unread();
    return {
      ...flags, zoom: S.zoom, stageRef: this.stageRef, stageKind: ['share', 'portfolio', 'auth', 'guestlink', 'signup', 'terms', 'emailcode', 'emailgen'].includes(cur) ? 'site' : 'app',
      localOn: S.localOn, cloudOn: S.cloudOn, smtpOn: S.smtpOn, uploadReq: S.uploadReq,
      envBanner: S.envDrift && S.admin && stageIsApp,
      goEnv: () => { window.__framesSettingsGo = { tab: 'srv', sec: 'server' }; window.dispatchEvent(new CustomEvent('frames-settings-go', { detail: window.__framesSettingsGo })); this.go('settings'); }, stop: (e) => e.stopPropagation(),
      flagsList: [['localOn', 'Local storage'], ['cloudOn', 'Cloud providers set'], ['admin', 'Signed in as admin'], ['envDrift', 'ENV out of sync with app'], ['smtpOn', 'Email (SMTP) working']].map(([k, label]) => ({ label, ...tog(S[k]), go: () => this.saveFlags({ [k]: !S[k] }) })),
      simAdmin: () => { if (!S.admin) this.saveFlags({ admin: true }); this.openUpd(); },
      updOpen: S.upd, closeUpd: () => this.setState({ upd: false }), remindUpd: () => this.setState({ upd: false }), updLoading: !S.rel,
      updSpin: React.createElement('i', { style: { width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block' } }),
      updTitle: rels.length ? rels[0].name + ' is ready to install' : 'A new version of Frames is out',
      updSub: rels.length > 1 ? 'This server runs ' + rels[rels.length - 1].name + '. Here’s what changed since.' : 'Here’s what changed.',
      rels: rels.length > 1 ? rels.slice(0, -1) : rels, updSource: S.relSrc === 'github' ? 'From GitHub releases · trentnbauer/Frames' : S.relSrc === 'fallback' ? 'Couldn’t reach GitHub · showing saved notes' : '',
      copyCmdLabel: S.cmdCopied ? 'Copied ✓' : 'Copy', copyCmd: () => { try { navigator.clipboard.writeText('docker compose pull && docker compose up -d'); } catch (e) {} this.setState({ cmdCopied: true }); clearTimeout(this.cT); this.cT = setTimeout(() => this.setState({ cmdCopied: false }), 1600); },
      profOpen: S.prof, notifOpen: S.notif, closeMenus: () => this.setState({ prof: false, notif: false }),
      ...(() => { const F = S.fb; if (!F) return { fbOpen: false }; const setF = (x) => this.setState({ fb: { ...F, ...x } }); const ok = F.title.trim().length > 2;
        const ctx = 'v1.17.0 · ' + cur + ' · ' + navigator.platform;
        return { fbOpen: true, closeFb: () => this.setState({ fb: null }), fbTitle: F.title, fbBody: F.body, onFbTitle: (e) => setF({ title: e.target.value, sent: false }), onFbBody: (e) => setF({ body: e.target.value }),
          fbPh: F.kind === 'Bug' ? 'Short summary, e.g. “Export button stays disabled”' : F.kind === 'Idea' ? 'What would you like Frames to do?' : 'Your question',
          fbKinds: ['Bug', 'Idea', 'Question'].map((k) => ({ label: k, bg: F.kind === k ? '#efede8' : 'transparent', fg: F.kind === k ? '#0d0d0d' : '#a8a59f', go: () => setF({ kind: k }) })),
          fbCtxBg: F.ctx ? '#efede8' : 'transparent', fbCtxTick: F.ctx ? '✓' : '', fbCtxText: ctx, toggleFbCtx: () => setF({ ctx: !F.ctx }),
          fbOp: ok ? 1 : 0.4, fbMsg: F.sent ? '✓ Opened GitHub in a new tab' : ok ? '' : 'Add a title first', fbMsgFg: F.sent ? 'oklch(0.78 0.12 150)' : '#6f6c67',
          sendFb: () => { if (!ok) return; const body = (F.body.trim() || '_No details given._') + (F.ctx ? '\n\n---\nFrames ' + ctx : ''); const label = { Bug: 'bug', Idea: 'enhancement', Question: 'question' }[F.kind];
            window.open('https://github.com/trentnbauer/Frames/issues/new?' + new URLSearchParams({ title: F.title.trim(), body, labels: label }).toString(), '_blank', 'noopener'); setF({ sent: true }); } }; })(),
      newsOpen: !!S.news, closeNews: () => this.setState({ news: false }),
      news: [['Guest suggestions you can preview and approve', 214], ['Frame size and mat options per print', 211], ['Analyze a photo with AI from its page', 208], ['Near-duplicate finder links variants', 203], ['Faster Library with a year scrubber', 199]].map(([t, num]) => ({ t, n: num })),
      notifs: this.NOTIFS().map(([id, icon, text, when, to, what]) => { const un = ['n1', 'n2', 'n3', 'n4'].includes(id) && !S.read.includes(id); return { icon, text, when, fg: un ? '#efede8' : '#a8a59f', bg: un ? 'rgba(255,255,255,.03)' : 'transparent', dot: un ? 'oklch(0.72 0.15 45)' : 'transparent', go: () => { this.setState({ read: [...S.read, id] }); this.deep(to, what); } }; }),
      readAll: () => this.setState({ read: ['n1', 'n2', 'n3', 'n4'] }), readAllFg: unread ? '#a8a59f' : '#5c5a56', notifSettings: () => { window.__framesSettingsGo = { tab: 'lib', sec: 'notifications' }; window.dispatchEvent(new CustomEvent('frames-settings-go', { detail: window.__framesSettingsGo })); this.go('settings'); },
      profItems: [
        { label: 'Settings', meta: '⌘ ,', sep: 'none', fg: '#efede8', go: () => this.go('settings') },
        { label: 'View my portfolio', meta: '↗', sep: 'none', fg: '#efede8', go: () => this.go('portfolio') },
        { label: 'Gear & wishlist', meta: '', sep: 'none', fg: '#efede8', go: () => this.go('gear') },
        { label: light ? 'Dark mode' : 'Light mode', meta: light ? '☾' : '☼', sep: 'none', fg: '#efede8', go: () => { this.setState({ prof: false }); this.setTheme(light ? 'dark' : 'light'); } },
        { label: 'Your stats', meta: '48,210 photos', sep: 'block', fg: '#efede8', go: () => this.go('stats') },
        { label: 'To do', meta: '1,284', sep: 'none', fg: '#efede8', go: () => this.go('todo') },
        { label: 'Community review', meta: '20', sep: 'none', fg: '#efede8', go: () => this.go('community') },
        { label: 'Near-duplicates', meta: '6', sep: 'none', fg: '#efede8', go: () => this.go('dupes') },
        { label: 'What’s new', meta: 'v1.17.0 ●', sep: 'block', fg: '#efede8', go: () => this.setState({ prof: false, news: true }) },
        { label: 'Welcome tour', meta: '', sep: 'none', fg: '#efede8', go: () => this.go('welcome') },
        { label: 'Help & docs', meta: '↗', sep: 'none', fg: '#efede8', go: () => this.setState({ prof: false }) },
        { label: 'Send feedback', meta: 'GitHub', sep: 'none', fg: '#efede8', go: () => this.setState({ prof: false, fb: { kind: 'Bug', title: '', body: '', ctx: true, sent: false } }) },
        { label: 'Sign out', meta: '', sep: 'block', fg: '#a8a59f', go: () => this.setState({ prof: false }) },
      ],
      groups: this.SCREENS.map(([name, items]) => ({ name, items: items.map(([k, label]) => { n++; return { label, key: String(n).padStart(2, '0'), bg: k === cur ? 'rgba(255,255,255,.08)' : 'transparent', fg: k === cur ? '#efede8' : '#a8a59f', go: () => this.go(k) }; }) })),
      prev: () => this.go(this.keys[(i - 1 + this.keys.length) % this.keys.length]), next: () => this.go(this.keys[(i + 1) % this.keys.length]),
    };
  }
}
