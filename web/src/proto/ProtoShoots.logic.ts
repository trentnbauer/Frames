/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Shoots.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = { selMode: false, picked: [], mv: null, movedOut: [], up: false, files: 0, prog: 0, phase: 'pick', mode: 'new', name: '', split: false, existing: 'Fremantle Markets', added: [], sync: 'idle', drag: false };
  componentDidMount() { if (this.props.uploadReq) this.open(); }
  componentDidUpdate(pp) { if (this.props.uploadReq && this.props.uploadReq !== pp.uploadReq) this.open(); }
  componentWillUnmount() { clearTimeout(this.csT); clearInterval(this.aiIv); clearInterval(this.iv); clearTimeout(this.tT); clearTimeout(this.sT); }
  open() { const lo = this.props.localOn !== false, co = this.props.cloudOn !== false; if (!lo && !co) return; this.setState({ src: lo ? 'upload' : 'cloud', cs: 'idle', clouds: { gd: true, ic: true }, up: true, files: 0, prog: 0, phase: 'pick', mode: 'new', name: '', split: false }); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2200); }
  addFiles() { this.setState({ files: 24, prog: 0, phase: 'reading' }); clearInterval(this.iv); this.iv = setInterval(() => { const p = this.state.prog + 9; if (p >= 100) { clearInterval(this.iv); this.setState({ prog: 100, phase: 'ready' }); } else this.setState({ prog: p }); }, 90); }
  mvVals(picked, fromName, onMove) {
    const S = this.state; const M = S.mv || { mode: 'new', name: '', q: '', target: null };
    const set = (p) => this.setState((s) => ({ mv: { ...(s.mv || M), ...p } }));
    const SH = [['Fremantle Markets', '86 photos · 7–8 Nov', 10], ['Rottnest, March', '142 photos · Mar 2026', 1], ['Kings Park dusk', '54 photos · Feb 2026', 3], ['Roll 41 · Portra', '36 photos · Jan 2026', 4], ['Margaret River', '211 photos · Dec 2025', 2], ['Garage day', '48 photos · Nov 2025', 5], ['Studio · Ana', '120 photos · Oct 2025', 8], ['Beetle rally', '77 photos · Sep 2025', 9]].filter(([n]) => n !== fromName);
    const q = M.q.trim().toLowerCase(); const n = picked.length; const ph = (fromName || 'New shoot') + ' · part 2';
    const ok = M.mode === 'new' || !!M.target;
    const sel = S.selMode;
    return {
      selBtnLabel: sel ? 'Done' : 'Select', selBtnBg: sel ? '#efede8' : 'transparent', selBtnFg: sel ? '#0d0d0d' : '#efede8', selBtnRing: sel ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.2)',
      toggleSel: () => this.setState({ selMode: !sel, picked: sel ? [] : S.picked }),
      hasPicked: n > 0, pickedLabel: n + ' selected', clearPicked: () => this.setState({ picked: [] }),
      openMv: () => this.setState({ mv: { mode: 'new', name: '', q: '', target: null } }),
      mvOpen: !!S.mv, closeMv: () => this.setState({ mv: null }), stopMv: (e) => e.stopPropagation(),
      mvThumbs: picked.slice(0, 3).map((p) => p.src), mvTitle: 'Move ' + n + (n === 1 ? ' photo' : ' photos'), mvSub: fromName ? 'From ' + fromName : 'From ' + [...new Set(picked.map((p) => p.from))].join(', '),
      mvModes: [['new', 'New shoot'], ['existing', 'Existing shoot']].map(([k, label]) => ({ label, bg: M.mode === k ? '#efede8' : 'transparent', fg: M.mode === k ? '#0d0d0d' : '#a8a59f', go: () => set({ mode: k }) })),
      mvIsNew: M.mode === 'new', mvIsExisting: M.mode === 'existing', mvName: M.name, mvOnName: (e) => set({ name: e.target.value }), mvPh: ph,
      mvQ: M.q, mvOnQ: (e) => set({ q: e.target.value }),
      mvList: SH.filter(([nm]) => !q || nm.toLowerCase().includes(q)).map(([name, meta, k]) => ({ name, meta, src: 'photos/p' + k + '.jpg', bg: M.target === name ? 'rgba(255,255,255,.06)' : 'transparent', tick: M.target === name ? '✓' : '', pick: () => set({ target: name }) })),
      mvGoOp: ok ? 1 : 0.4, mvGoLabel: M.mode === 'new' ? 'Create shoot and move' : 'Move ' + n + (n === 1 ? ' photo' : ' photos'),
      mvGo: () => { if (!ok) return; const dest = M.mode === 'new' ? (M.name.trim() || ph) : M.target; onMove(dest, M.mode === 'new'); this.setState({ mv: null, picked: [], selMode: false }); this.flash((M.mode === 'new' ? 'Created “' + dest + '” · ' : 'Moved to “' + dest + '” · ') + n + (n === 1 ? ' photo' : ' photos')); },
    };
  }
  shootView() {
    const S = this.state; const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const sh = S.shootSel; if (!sh) return { ...this.mvVals([], '', () => {}), hasPicked: false, mvOpen: false, inShoot: false, sv: { name: '', place: '', dates: '', kit: '', unrated: 0, stats: [], filters: [], sorts: [], days: [], hasDays: false, empty: false, onName: () => {} } };
    const seq = [9, 0, 6, 3, 4, 7, 1, 8, 2, 5, 6, 9, 0, 3, 7, 4, 2, 8, 1, 5, 3, 6]; const moved = S.movedOut || [];
    const N = Math.min(seq.length, Math.max(8, Math.round(sh.count / 6)));
    const photos = seq.slice(0, N).map((n, i) => ({ n, i, score: [4.6, 3.2, 4.1, null, 4.4, 2.8, null, 3.9, 4.8, null, 3.5, 4.2, null, 4.0, 3.1, 4.5, null, 3.7, 4.3, 2.5, null, 4.1][i], comp: [0, 4, 8].includes(i), isNew: sh.tag === '146 new' && i < 6, missing: i % 3 === 1, day: i < N / 2 || !sh.twoDays ? 0 : 1 }));
    const F = { all: () => true, new: (p) => p.isNew, unrated: (p) => p.score == null, top: (p) => p.score >= 4, comp: (p) => p.comp, details: (p) => p.missing && S.shootAi !== 'done' };
    const fk = S.shootFilter || 'all'; const sort = S.shootSort || 'time';
    let list = photos.filter((p) => !moved.includes(p.i)).filter(F[fk]); if (sort === 'score') list = [...list].sort((a, b) => (b.score || 0) - (a.score || 0));
    const pick = (i) => this.setState((s) => ({ selMode: true, picked: s.picked.includes(i) ? s.picked.filter((x) => x !== i) : [...s.picked, i] }));
    const mk = (p) => ({ go: S.selMode ? '' : 'photo', click: () => { if (S.selMode) pick(p.i); }, tickShow: S.selMode ? 'block' : 'none', tick: S.picked.includes(p.i) ? '#efede8' : 'rgba(0,0,0,.35)', mark: S.picked.includes(p.i) ? '✓' : '', outline: S.picked.includes(p.i) ? '2px solid #efede8' : 'none', src: 'photos/p' + (p.n + 1) + '.jpg', ar: AR[p.n], flex: AR[p.n] + ' ' + AR[p.n] + ' ' + Math.round(AR[p.n] * 200) + 'px', badge: p.comp ? 'In a composition' : p.score != null ? p.score.toFixed(1) : 'Unrated', badgeShow: 'block' });
    const days = sort === 'time' && sh.twoDays ? [0, 1].map((d) => ({ label: d ? 'Sat 8 Nov' : 'Fri 7 Nov', items: list.filter((p) => p.day === d) })).filter((d) => d.items.length) : [{ label: sort === 'score' ? 'Best first' : sh.dates, items: list }];
    const rated = photos.filter((p) => p.score != null);
    const avg = rated.length ? (rated.reduce((t, p) => t + p.score, 0) / rated.length).toFixed(1) : '–';
    const scale = sh.count / N; const fmt = (x) => Math.round(x * scale);
    return { inShoot: true, sv: {
      name: S.shootName != null ? S.shootName : sh.name, onName: (e) => this.setState({ shootName: e.target.value }), place: sh.place, dates: sh.dates, kit: sh.kit, unrated: fmt(photos.length - rated.length),
      ...(() => { const st = S.shootAi || 'idle'; const busy = st === 'busy'; return {
        aiLabel: busy ? 'Analyzing ' + Math.min(sh.count, Math.round(((S.shootAiP || 0) / 100) * sh.count)) + ' of ' + sh.count + '…' : st === 'done' ? '✓ Analyzed' : '✦ Analyze with AI', aiFg: busy ? '#a8a59f' : '#efede8',
        aiSpin: busy ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
        ai: () => { if (busy) return; this.setState({ shootAi: 'busy', shootAiP: 0 }); clearInterval(this.aiIv); this.aiIv = setInterval(() => { const p = (this.state.shootAiP || 0) + 8; if (p >= 100) { clearInterval(this.aiIv); this.setState({ shootAi: 'done', shootAiP: 100 }); this.flash('Subjects, tags and descriptions suggested · accept them from To do'); } else this.setState({ shootAiP: p }); }, 120); },
      }; })(),
      stats: [[String(sh.count), 'photos', null], [Math.round((rated.length / photos.length) * 100) + '%', 'reviewed', Math.round((rated.length / photos.length) * 100)], [avg, 'average score', null], [String(fmt(photos.filter((p) => p.comp).length)), 'in compositions', null], [S.shootAi === 'done' ? '0' : String(fmt(photos.filter((p) => p.missing).length)), S.shootAi === 'done' ? 'missing details · AI filled ' + fmt(photos.filter((p) => p.missing).length) : 'missing details', null]].map(([v, l, pct]) => ({ v, l, pct: (pct || 0) + '%', barShow: pct == null ? 'none' : 'block' })),
      filters: [['all', 'All'], ['new', 'New'], ['unrated', 'Unrated'], ['top', 'Rated 4+'], ['comp', 'In a composition'], ['details', 'Missing details']].filter(([k]) => k !== 'new' || photos.some(F.new)).map(([k, label]) => ({ label, n: fmt(photos.filter(F[k]).length), bg: fk === k ? '#efede8' : 'rgba(255,255,255,.06)', fg: fk === k ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ shootFilter: k }) })),
      sorts: [['time', 'By time'], ['score', 'By score']].map(([k, label]) => ({ label: (sort === k ? '✓ ' : '') + label, fg: sort === k ? '#efede8' : '#8f8c86', go: () => this.setState({ shootSort: k }) })),
      hasDays: list.length > 0, empty: list.length === 0, days: days.map((d) => { const ids = d.items.map((p) => p.i); const all = ids.length && ids.every((i) => S.picked.includes(i)); return { label: d.label, count: d.items.length + ' shown', selAllLabel: all ? 'Deselect all' : 'Select all', selAll: () => this.setState((s) => ({ selMode: true, picked: all ? s.picked.filter((x) => !ids.includes(x)) : [...new Set([...s.picked, ...ids])] })), photos: d.items.map(mk) }; }),
    }, closeShoot: () => this.setState({ shootSel: null, shootName: null, selMode: false, picked: [] }),
      ...this.mvVals(S.picked.map((i) => ({ src: 'photos/p' + (seq[i] + 1) + '.jpg' })), S.shootName || sh.name, () => this.setState((s) => ({ movedOut: [...(s.movedOut || []), ...s.picked] }))) };
  }
  upVals() {
    const S = this.state; const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const tog = S.split; const uploading = S.phase === 'uploading';
    const shown = Math.round((S.prog / 100) * 12);
    return {
      upOpen: S.up, openUp: () => this.open(), closeUp: () => { clearInterval(this.iv); this.setState({ up: false }); }, stop: (e) => e.stopPropagation(),
      ...(() => { const lo = this.props.localOn !== false, co = this.props.cloudOn !== false; const src = S.src || (lo ? 'upload' : 'cloud'); const cl = S.clouds || { gd: true, ic: true }; const cs = S.cs || 'idle'; const AR2 = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67]; const anyCl = cl.gd || cl.ic; const found = (cl.gd ? 17 : 0) + (cl.ic ? 6 : 0);
        return { canAdd: lo || co, cantAdd: !(lo || co), upBothSrc: lo && co, upSrcCloud: src === 'cloud', isCloud: src === 'cloud', cloudFound: found, cloudCs: cs, cloudAny: anyCl,
          upSub: src === 'cloud' ? 'Check your cloud folders for new photos now, instead of waiting for the hourly sync' : 'To your library on this server · /mnt/photos · 248 GB free',
          upSrcs: [['upload', 'Upload from this computer', 'Drop files or choose a folder'], ['cloud', 'Sync from the cloud', 'Google Drive, iCloud · last 14:02']].map(([key, label, hint]) => ({ label, hint, bg: src === key ? '#1e1e1d' : 'transparent', fg: src === key ? '#efede8' : '#a8a59f', go: () => this.setState({ src: key }) })),
          upClouds: [['gd', 'GD', 'Google Drive', '/Camera uploads', '17 new'], ['ic', 'iC', 'iCloud Photos', 'Shared album “Frames”', '6 new']].map(([key, icon, name, where, nw]) => ({ icon, name, where, tick: cl[key] ? '✓' : '', boxBg: cl[key] ? '#efede8' : 'transparent', boxRing: cl[key] ? 'none' : 'inset 0 0 0 1.5px rgba(255,255,255,.3)', status: cs === 'done' && cl[key] ? nw : cs === 'busy' && cl[key] ? 'checking…' : 'synced 14:02', stFg: cs === 'done' && cl[key] ? '#efede8' : '#6f6c67', toggle: () => { if (cs !== 'busy') this.setState({ clouds: { ...cl, [key]: !cl[key] }, cs: 'idle' }); } })),
          upCloudSpin: cs === 'busy' ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
          upCloudMsg: cs === 'busy' ? 'Checking for new photos…' : cs === 'done' ? found + ' new photos found · 2 duplicates skipped' : anyCl ? 'Nothing is downloaded until you add them.' : 'Pick at least one folder.',
          upCloudDone: cs === 'done', upCloudThumbs: [2, 5, 8, 0, 6, 3, 9, 1].map((n) => ({ src: 'photos/p' + (n + 1) + '.jpg', ar: AR2[n] })) }; })(),
      upEmpty: !S.files && (S.src || 'upload') === 'upload', upShowFiles: !!S.files && (S.src || 'upload') === 'upload', upHasFiles: !!S.files && (S.src || 'upload') === 'upload', upPick: () => this.addFiles(),
      upDragOver: (e) => { e.preventDefault(); if (!S.drag) this.setState({ drag: true }); }, upDragLeave: () => this.setState({ drag: false }), upDrop: (e) => { e.preventDefault(); this.setState({ drag: false }); this.addFiles(); },
      upZoneBg: S.drag ? 'rgba(239,237,232,.08)' : '#0d0d0d', upZoneRing: S.drag ? '#efede8' : 'rgba(255,255,255,.18)',
      upCount: S.files, upMeta: '1.2 GB · 7–8 Nov 2026 · Fujifilm X-T5', upClearShow: uploading ? 'none' : 'inline', upClear: () => this.setState({ files: 0, prog: 0, phase: 'pick' }),
      upThumbs: [3, 6, 7, 0, 8, 5, 9, 4, 1, 2, 6, 3].map((n, i) => ({ src: 'photos/p' + (n + 1) + '.jpg', ar: AR[n], op: i < shown || S.phase === 'ready' ? 1 : 0.25 })),
      upPct: S.prog + '%', upStatus: S.phase === 'reading' ? 'Reading ' + Math.round(S.prog * 0.24) + ' of 24…' : uploading ? 'Uploading ' + Math.round(S.prog * 0.24) + ' of 24…' : S.phase === 'done' ? '✓ Uploaded' : '✓ Ready · 2 duplicates skipped',
      upModes: [['new', 'New shoot'], ['existing', 'Existing shoot']].map(([k, label]) => ({ label, bg: S.mode === k ? '#efede8' : 'transparent', fg: S.mode === k ? '#0d0d0d' : '#a8a59f', go: () => this.setState({ mode: k }) })),
      upNamePh: S.files ? 'Fremantle Markets · or leave blank for 9 Nov 2026' : 'Name this shoot · or leave blank for 9 Nov 2026', upNameHint: S.name.trim() ? 'Shown on Photoshoots and in your Library' : S.files ? '✦ Suggested: Fremantle Markets, from the place in the photos. Blank uses today’s date.' : 'Leave blank to name it with today’s date. You can rename it later.',
      upIsNew: S.mode === 'new', upIsExisting: S.mode === 'existing', upName: S.name, upOnName: (e) => this.setState({ name: e.target.value }),
      upSplitHint: tog ? 'Makes 2 shoots: Fri 7 Nov (14) and Sat 8 Nov (10)' : 'These span 2 days. Keep as one shoot, or make one per day.', upSplitTog: () => this.setState({ split: !tog }),
      upSplitTrack: tog ? '#efede8' : 'rgba(255,255,255,.14)', upSplitKnob: tog ? '21px' : '3px', upSplitKnobBg: tog ? '#0d0d0d' : '#a8a59f',
      upExisting: [['Fremantle Markets', '86 photos · 3 days ago', 10], ['Rottnest, March', '142 photos', 1], ['Kings Park dusk', '54 photos', 3], ['Studio · Ana', '120 photos', 8]].map(([name, meta, n]) => ({ name, meta, src: 'photos/p' + n + '.jpg', bg: S.existing === name ? 'rgba(255,255,255,.06)' : 'transparent', tick: S.existing === name ? '✓' : '', pick: () => this.setState({ existing: name }) })),
      upFoot: S.src === 'cloud' ? (S.cs === 'done' ? (S.mode === 'new' ? 'Creates “' + (S.name.trim() || '9 Nov 2026') + '”' : 'Adds to “' + S.existing + '”') : 'Syncs the ticked folders') : !S.files ? 'Up to 2,000 files at a time' : S.mode === 'new' ? (tog ? 'Creates 2 shoots' : 'Creates “' + (S.name.trim() || '9 Nov 2026') + '”') : 'Adds to “' + S.existing + '”',
      upGoOp: S.src === 'cloud' ? ((S.clouds || { gd: 1 }).gd || (S.clouds || {}).ic ? (S.cs === 'busy' ? 0.6 : 1) : 0.4) : S.phase === 'ready' ? 1 : 0.4, upGoLabel: S.src === 'cloud' ? (S.cs === 'busy' ? 'Syncing…' : S.cs === 'done' ? 'Add ' + ((S.clouds.gd ? 17 : 0) + (S.clouds.ic ? 6 : 0)) + ' photos' : 'Sync now') : uploading ? 'Uploading…' : S.files ? 'Upload ' + S.files + ' photos' : 'Upload',
      upGo: () => { if (S.src === 'cloud') { const cl = S.clouds || {}; if (!cl.gd && !cl.ic || S.cs === 'busy') return; if (S.cs !== 'done') { this.setState({ cs: 'busy' }); clearTimeout(this.csT); this.csT = setTimeout(() => this.setState({ cs: 'done' }), 1500); return; } const n = (cl.gd ? 17 : 0) + (cl.ic ? 6 : 0); const nm = S.mode === 'existing' ? null : (S.name.trim() || '9 Nov 2026'); this.setState((s) => ({ up: false, cs: 'idle', added: nm ? [nm, ...s.added] : s.added })); this.flash(nm ? '“' + nm + '” created · ' + n + ' photos from the cloud' : n + ' photos added to ' + S.existing); return; } if (S.phase !== 'ready') return; this.setState({ phase: 'uploading', prog: 0 }); clearInterval(this.iv); this.iv = setInterval(() => { const p = this.state.prog + 6; if (p >= 100) { clearInterval(this.iv); const names = S.mode === 'existing' ? [] : tog ? [(S.name.trim() || '9 Nov 2026') + ' · Fri', (S.name.trim() || '9 Nov 2026') + ' · Sat'] : [S.name.trim() || '9 Nov 2026']; this.setState((s) => ({ prog: 100, phase: 'done', up: false, added: [...names, ...s.added] })); this.flash(S.mode === 'existing' ? '24 photos added to ' + S.existing : names.length > 1 ? '2 shoots created · 24 photos' : '“' + names[0] + '” created · 24 photos'); } else this.setState({ prog: p }); }, 80); },
      syncLabel: S.sync === 'busy' ? 'Syncing…' : 'Sync cloud', syncTitle: 'Google Drive and iCloud · last synced 14:02',
      syncSpin: S.sync === 'busy' ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block' } }) : null,
      sync: () => { if (S.sync === 'busy') return; this.setState({ sync: 'busy' }); clearTimeout(this.sT); this.sT = setTimeout(() => { this.setState({ sync: 'idle' }); this.flash('Google Drive and iCloud synced · 23 new photos to organise on Home'); }, 1600); },
      toast: S.toast || '', toastOp: S.tOp || 0, cloudOn: this.props.cloudOn !== false, localOn: this.props.localOn !== false,
    };
  }
  renderVals() {
    const AR = [0.67, 0.56, 0.56, 0.67, 1.78, 0.8, 0.8, 0.72, 1.5, 0.67];
    const ph = (i, h, extra = {}) => { const n = ((i % 10) + 10) % 10; const ar = AR[n]; return { src: `photos/p${n + 1}.jpg`, ar, flex: `${ar} ${ar} ${Math.round(ar * h)}px`, ...extra }; };
    const sel = new Set([0, 2, 5]);
    const rowA = [3, 6, 7, 0, 8, 5, 9, 4, 1, 2, 6, 3].map((n, i) => ph(n, 190, { tick: sel.has(i) ? '#efede8' : 'rgba(0,0,0,.35)', mark: sel.has(i) ? '✓' : '', outline: sel.has(i) ? '2px solid #efede8' : 'none', badgeShow: i === 4 || i === 9 ? 'block' : 'none' }));
    const rowB = [4, 0, 9, 2, 1, 8, 6, 3].map((n) => ph(n, 190));
    const searchRow = [3, 6, 7, 0, 5, 9, 8, 2, 1].map((n) => ph(n, 110));
    const names = [['Fremantle Markets', 86, 'Fremantle', '7–8 Nov 2026', '25%'], ['Rottnest, March', 142, 'Rottnest Island', 'Mar 2026', '50%'], ['Kings Park dusk', 54, 'Perth', 'Feb 2026', '75%'], ['Roll 41 · Portra', 36, 'Perth', 'Jan 2026', '100%'], ['Margaret River', 211, 'Margaret River', 'Dec 2025', '100%'], ['Garage day', 48, 'Osborne Park', 'Nov 2025', '100%'], ['Studio · Ana', 120, 'Northbridge', 'Oct 2025', '100%'], ['Beetle rally', 77, 'Bunbury', 'Sep 2025', '100%']];
    const pics = [10, 1, 3, 4, 2, 5, 8, 9];
    const shoots = names.map(([name, count, place, dates, pct], i) => ({ name, count, place, dates, pct, src: `photos/p${pics[i]}.jpg` }));
    const tags = [['146 new', '#efede8'], ['Not composed', '#efede8'], ['Needs review', '#efede8'], ['In 1 composition', '#a8a59f'], ['In 3 compositions', '#a8a59f'], ['Not composed', '#efede8'], ['In 2 compositions', '#a8a59f'], ['In 1 composition', '#a8a59f']];
    const KIT = ['Fujifilm X-T5', 'Nikon FM2 · Portra 400', 'Fujifilm X-T5', 'Pentax 67 · Portra 400', 'Nikon FM2 · Gold 200', 'Fujifilm X-T5', 'Fujifilm X-T5 · 56mm', 'Fujifilm X-T5'];
    const open = (s, i) => () => { this.setState({ shootSel: { ...s, kit: KIT[i] || 'Fujifilm X-T5', twoDays: /–/.test(s.dates) }, shootName: null, shootFilter: 'all', shootSort: 'time', shootAi: 'idle', shootAiP: 0, selMode: false, picked: [], movedOut: [] }); clearInterval(this.aiIv); window.scrollTo(0, 0); };
    const shootsAfter0 = [...this.state.added.map((name, i) => ({ name, count: this.state.split ? (i ? 10 : 14) : 24, place: 'Fremantle', dates: 'Today', src: 'photos/p' + (7 + i) + '.jpg', tag: 'Just uploaded', tagColor: '#efede8' })), ...shoots.map((s, i) => ({ ...s, tag: tags[i][0], tagColor: tags[i][1] }))];
    const shootsAfter = shootsAfter0.map((s, i) => ({ ...s, open: open(s, i) }));
    return { rowA, rowB, searchRow, shoots, shootsAfter, ...this.upVals(), ...this.shootView() };
  }
}
