/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Shoots.dc.html. Behaviour is the spec; the data and the actions come in through props
// (see screens/Shoots.tsx for what each prop is).
import React from 'react';
import { DCLogic } from './runtime';

const spin = () => React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--outline)', borderTopColor: 'var(--text)', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } });

export class Logic extends DCLogic {
  state = { selMode: false, picked: [], mv: null, up: false, phase: 'pick', prog: 0, mode: 'new', name: '', split: false, existing: null, src: null, clouds: {}, cs: 'idle', found: 0, drag: false, shootFilter: 'all', shootSort: 'time', shootName: null, shootEdit: null, placeOpen: false, toast: '', tOp: 0 };
  componentDidMount() { if (this.props.uploadReq) this.open(); }
  componentDidUpdate(pp) { if (this.props.uploadReq && this.props.uploadReq !== pp.uploadReq) this.open(); }
  componentWillUnmount() { clearTimeout(this.tT); }
  open() {
    const P = this.props; if (!P.localOn && !P.cloudOn) return;
    const clouds = {}; (P.conns || []).forEach((c) => { clouds[c.id] = true; });
    this.setState({ src: P.localOn ? 'upload' : 'cloud', cs: 'idle', clouds, up: true, prog: 0, phase: 'pick', mode: 'new', name: '', split: false, existing: P.existing && P.existing[0] ? P.existing[0].id : null });
  }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2800); }

  mvVals(ids, fromName) {
    const S = this.state, P = this.props;
    const M = S.mv || { mode: 'new', name: '', q: '', target: null };
    const set = (p) => this.setState((s) => ({ mv: { ...(s.mv || M), ...p } }));
    const q = M.q.trim().toLowerCase(); const n = ids.length;
    const ok = M.mode === 'new' || M.target != null;
    const sel = S.selMode;
    return {
      selBtnLabel: sel ? 'Done' : 'Select', selBtnBg: sel ? 'var(--text)' : 'transparent', selBtnFg: sel ? 'var(--bg)' : 'var(--text)', selBtnRing: sel ? 'none' : 'inset 0 0 0 1px var(--outline)',
      toggleSel: () => this.setState({ selMode: !sel, picked: sel ? [] : S.picked }),
      hasPicked: n > 0, pickedLabel: n + ' selected', clearPicked: () => this.setState({ picked: [] }),
      openMv: () => this.setState({ mv: { mode: 'new', name: '', q: '', target: null } }),
      mvOpen: !!S.mv, closeMv: () => this.setState({ mv: null }), stopMv: (e) => e.stopPropagation(),
      mvThumbs: ids.slice(0, 3).map((id) => P.thumb(id)), mvTitle: 'Move ' + n + (n === 1 ? ' photo' : ' photos'), mvSub: 'From ' + (fromName || 'the shoot'),
      mvModes: [['new', 'New shoot'], ['existing', 'Existing shoot']].map(([k, label]) => ({ label, bg: M.mode === k ? 'var(--text)' : 'transparent', fg: M.mode === k ? 'var(--bg)' : 'var(--text2)', go: () => set({ mode: k }) })),
      mvIsNew: M.mode === 'new', mvIsExisting: M.mode === 'existing', mvName: M.name, mvOnName: (e) => set({ name: e.target.value }), mvPh: (fromName || 'New shoot') + ' · part 2',
      mvQ: M.q, mvOnQ: (e) => set({ q: e.target.value }),
      mvList: (P.moveTargets || []).filter((s) => s.id !== (P.shoot && P.shoot.id) && (!q || s.name.toLowerCase().includes(q))).map((s) => ({ name: s.name, meta: s.meta, src: s.src, bg: M.target === s.id ? 'var(--hover)' : 'transparent', tick: M.target === s.id ? '✓' : '', pick: () => set({ target: s.id }) })),
      mvGoOp: ok ? 1 : 0.4, mvGoLabel: M.mode === 'new' ? 'Create shoot and move' : 'Move ' + n + (n === 1 ? ' photo' : ' photos'),
      mvGo: async () => {
        if (!ok) return;
        const dest = await P.onMove(ids, { mode: M.mode, name: M.name.trim(), shootId: M.target });
        this.setState({ mv: null, picked: [], selMode: false });
        this.flash((M.mode === 'new' ? 'Created “' + dest + '” · ' : 'Moved to “' + dest + '” · ') + n + (n === 1 ? ' photo' : ' photos'));
      },
    };
  }

  shootView() {
    const S = this.state, P = this.props;
    const sh = P.shoot;
    if (!sh) return { ...this.mvVals([], ''), hasPicked: false, mvOpen: false, inShoot: false, sv: { name: '', place: '', dates: '', kit: '', unrated: 0, stats: [], filters: [], sorts: [], days: [], hasDays: false, empty: false, onName: () => {} } };
    const photos = P.shootPhotos || [];
    const F = { all: () => true, new: (p) => p.isNew, unrated: (p) => p.score == null, top: (p) => p.score >= 4, comp: (p) => p.comp, details: (p) => p.missing };
    const fk = S.shootFilter, sort = S.shootSort;
    let list = photos.filter(F[fk]); if (sort === 'score') list = [...list].sort((a, b) => (b.score || 0) - (a.score || 0));
    const pick = (id) => this.setState((s) => ({ selMode: true, picked: s.picked.includes(id) ? s.picked.filter((x) => x !== id) : [...s.picked, id] }));
    const mk = (p) => ({ go: '', click: () => { if (S.selMode) pick(p.id); else P.onOpenPhoto(p.id); }, tickShow: S.selMode ? 'block' : 'none', tick: S.picked.includes(p.id) ? 'var(--text)' : 'rgba(0,0,0,.35)', mark: S.picked.includes(p.id) ? '✓' : '', outline: S.picked.includes(p.id) ? '2px solid var(--text)' : 'none', src: p.src, ar: p.ar, flex: p.ar + ' ' + p.ar + ' ' + Math.round(p.ar * 200) + 'px', badge: p.score != null ? p.score.toFixed(1) : '', badgeShow: p.score != null ? 'block' : 'none' });
    const dayNames = [...new Set(photos.map((p) => p.dayLabel))];
    const days = sort === 'time' && dayNames.length > 1 ? dayNames.map((label) => ({ label, items: list.filter((p) => p.dayLabel === label) })).filter((d) => d.items.length) : [{ label: sort === 'score' ? 'Best first' : sh.dates, items: list }];
    const rated = photos.filter((p) => p.score != null);
    const avg = rated.length ? (rated.reduce((t, p) => t + p.score, 0) / rated.length).toFixed(1) : '–';
    const pct = photos.length ? Math.round((rated.length / photos.length) * 100) : 0;
    const missing = photos.filter((p) => p.missing).length;
    const ai = P.aiState || 'idle';
    return {
      inShoot: true,
      sv: {
        name: S.shootName != null ? S.shootName : sh.name, onName: (e) => this.setState({ shootName: e.target.value }), onNameBlur: () => { if (S.shootName != null && S.shootName.trim() && S.shootName !== sh.name) P.onRename(S.shootName.trim()); },
        place: sh.place, dates: sh.dates, kit: sh.kit,
        ...(() => { // the place and camera in the heading: click to edit, saved on leaving the box, and applied to every photograph in the shoot
          const ed = S.shootEdit && S.shootEdit.id === sh.id ? S.shootEdit : { id: sh.id };
          const set = (k, v) => this.setState({ shootEdit: { ...ed, id: sh.id, [k]: v } });
          const done = (k, cur, save) => { const v = ed[k]; if (v != null && v.trim() !== cur) save(v.trim()); };
          return { placeVal: sh.placeVal,
            camVal: sh.camVal, onCamCommit: (v) => { if (v !== sh.camVal) P.onCamera(v); },
            placeOpen: S.placeOpen, openPlace: () => this.setState({ placeOpen: true }), closePlace: () => this.setState({ placeOpen: false }), placePin: sh.placePin, kitRest: sh.kitRest }; })(),
        unrated: photos.length - rated.length,
        aiLabel: ai === 'busy' ? 'Analyzing…' : ai === 'done' ? '✓ Analyzed' : '✦ Analyze with AI', aiFg: ai === 'busy' ? 'var(--text2)' : 'var(--text)', aiSpin: ai === 'busy' ? spin() : null,
        ai: async () => { if (ai === 'busy' || !P.aiOn) { if (!P.aiOn) this.flash('AI is off. Turn it on in Settings.'); return; } const msg = await P.onAnalyse(); if (msg) this.flash(msg); },
        startReview: () => P.onStartReview(), compose: () => P.onCompose(),
        stats: [[String(photos.length), 'photos', null], [pct + '%', 'reviewed', pct], [avg, 'average score', null], [String(photos.filter((p) => p.comp).length), 'in compositions', null], [String(missing), 'missing details', null]].map(([v, l, bar]) => ({ v, l, pct: bar != null ? bar + '%' : '0%', barShow: bar != null ? 'block' : 'none' })),
        filters: [['all', 'All'], ['new', 'New'], ['unrated', 'Unrated'], ['top', 'Rated 4+'], ['comp', 'In a composition'], ['details', 'Missing details']].filter(([k]) => k !== 'new' || photos.some(F.new)).map(([k, label]) => ({ label, n: photos.filter(F[k]).length, bg: fk === k ? 'var(--text)' : 'var(--hover)', fg: fk === k ? 'var(--bg)' : 'var(--text2)', go: () => this.setState({ shootFilter: k }) })),
        sorts: [['time', 'By time'], ['score', 'By score']].map(([k, label]) => ({ label: (sort === k ? '✓ ' : '') + label, fg: sort === k ? 'var(--text)' : 'var(--muted)', go: () => this.setState({ shootSort: k }) })),
        hasDays: list.length > 0, empty: list.length === 0,
        days: days.map((d) => { const ids = d.items.map((p) => p.id); const all = ids.length && ids.every((i) => S.picked.includes(i)); return { label: d.label, count: d.items.length + ' shown', selAllLabel: all ? 'Deselect all' : 'Select all', selAll: () => this.setState((s) => ({ selMode: true, picked: all ? s.picked.filter((x) => !ids.includes(x)) : [...new Set([...s.picked, ...ids])] })), photos: d.items.map(mk) }; }),
      },
      closeShoot: () => this.props.onCloseShoot(),
      ...this.mvVals(S.picked, S.shootName || sh.name),
    };
  }

  upVals() {
    const S = this.state, P = this.props;
    const lo = !!P.localOn, co = !!P.cloudOn;
    const src = S.src || (lo ? 'upload' : 'cloud');
    const conns = P.conns || [];
    const cl = S.clouds; const anyCl = conns.some((c) => cl[c.id]);
    const files = P.files || []; const nFiles = files.length;
    const uploading = S.phase === 'uploading';
    const tog = S.split;
    const today = P.today;
    const existing = P.existing || [];
    const ex = existing.find((e) => e.id === S.existing) || existing[0];
    const name = S.name.trim();
    const goCloud = async () => {
      if (!anyCl || S.cs === 'busy') return;
      if (S.cs !== 'done') { this.setState({ cs: 'busy' }); try { const r = await P.onCloudSync(conns.filter((c) => cl[c.id]).map((c) => c.id)); this.setState({ cs: 'done', found: r.imported, cloudShootId: r.shootId }); } catch (e) { this.setState({ cs: 'idle' }); this.flash(e.message); } return; }
      await P.onCloudPlace({ shootId: S.cloudShootId, mode: S.mode, name, existingId: S.existing, split: tog });
      this.setState({ up: false, cs: 'idle' }); this.flash(S.found + ' photos added from the cloud');
    };
    const goUpload = async () => {
      if (S.phase !== 'ready' && !(nFiles && S.phase === 'pick')) return;
      this.setState({ phase: 'uploading', prog: 0 });
      try {
        const r = await P.onUpload({ mode: S.mode, name, split: tog, existingId: S.existing }, (p) => this.setState({ prog: p }));
        this.setState({ up: false, phase: 'pick' }); P.onFiles([]);
        this.flash(r.imported ? (r.name ? '“' + r.name + '” · ' : '') + r.imported + ' photos added' : 'Nothing new to add. These photos are already in your library.');
      } catch (e) { this.setState({ phase: 'pick' }); this.flash(e.message || 'Upload failed'); }
    };
    return {
      upOpen: S.up, openUp: () => this.open(), closeUp: () => { if (!uploading) this.setState({ up: false }); }, stop: (e) => e.stopPropagation(),
      canAdd: lo || co, cantAdd: !(lo || co), upBothSrc: lo && co, upSrcCloud: src === 'cloud', isCloud: src === 'cloud',
      cloudCs: S.cs, cloudAny: anyCl,
      upSub: src === 'cloud' ? 'Check your cloud folders for new photos now, instead of waiting for the hourly sync' : P.storageSub,
      upSrcs: [['upload', 'Upload from this computer', 'Drop files or choose a folder'], ['cloud', 'Sync from the cloud', P.cloudHint]].map(([key, label, hint]) => ({ label, hint, bg: src === key ? 'var(--raised2)' : 'transparent', fg: src === key ? 'var(--text)' : 'var(--text2)', go: () => this.setState({ src: key }) })),
      upClouds: conns.map((c) => ({ icon: c.icon, name: c.name, where: c.where, tick: cl[c.id] ? '✓' : '', boxBg: cl[c.id] ? 'var(--text)' : 'transparent', boxRing: cl[c.id] ? 'none' : 'inset 0 0 0 1.5px color-mix(in srgb, var(--text) 30%, transparent)', status: S.cs === 'done' && cl[c.id] ? 'synced' : S.cs === 'busy' && cl[c.id] ? 'syncing…' : '', stFg: 'var(--muted)', toggle: () => this.setState({ clouds: { ...cl, [c.id]: !cl[c.id] } }) })),
      upCloudSpin: S.cs === 'busy' ? spin() : null,
      upCloudMsg: S.cs === 'busy' ? 'Checking for new photos…' : S.cs === 'done' ? S.found + ' new photos found' : anyCl ? 'Nothing is downloaded until you add them.' : 'Pick at least one folder.',
      upCloudDone: S.cs === 'done', upCloudThumbs: [],
      upEmpty: !nFiles && src === 'upload', upShowFiles: !!nFiles && src === 'upload', upHasFiles: !!nFiles && src === 'upload', upPick: () => P.pickFiles(),
      upDragOver: (e) => { e.preventDefault(); if (!S.drag) this.setState({ drag: true }); }, upDragLeave: () => this.setState({ drag: false }), upDrop: (e) => { e.preventDefault(); this.setState({ drag: false }); P.onFiles([...(e.dataTransfer.files || [])]); this.setState({ phase: 'ready' }); },
      upZoneBg: S.drag ? 'rgba(239,237,232,.08)' : 'var(--bg)', upZoneRing: S.drag ? 'var(--text)' : 'color-mix(in srgb, var(--text) 18%, transparent)',
      upCount: nFiles, upMeta: P.filesMeta || '', upClearShow: uploading ? 'none' : 'inline', upClear: () => { P.onFiles([]); this.setState({ phase: 'pick' }); },
      upThumbs: [], upPct: S.prog + '%', upStatus: uploading ? 'Uploading ' + Math.round((S.prog / 100) * nFiles) + ' of ' + nFiles + '…' : '✓ Ready',
      upModes: [['new', 'New shoot'], ['existing', 'Existing shoot']].map(([k, label]) => ({ label, bg: S.mode === k ? 'var(--text)' : 'transparent', fg: S.mode === k ? 'var(--bg)' : 'var(--text2)', go: () => this.setState({ mode: k }) })),
      upNamePh: (P.suggestName || today) ? (P.suggestName || today) + ' · or leave blank for ' + today : 'Name this shoot · or leave blank for ' + today,
      upNameHint: name ? 'Shown on Photoshoots and in your Library' : P.suggestName ? '✦ Suggested: ' + P.suggestName + ', from the date of the photos. Blank uses it.' : 'Leave blank to name it with today’s date. You can rename it later.',
      upIsNew: S.mode === 'new', upIsExisting: S.mode === 'existing', upName: S.name, upOnName: (e) => this.setState({ name: e.target.value }),
      upSplitHint: tog ? 'Makes one shoot per day' : 'If these span more than one day, keep them as one shoot or make one per day.', upSplitTog: () => this.setState({ split: !tog }),
      upSplitTrack: tog ? 'var(--text)' : 'color-mix(in srgb, var(--text) 14%, transparent)', upSplitKnob: tog ? '21px' : '3px', upSplitKnobBg: tog ? 'var(--bg)' : 'var(--text2)',
      upExisting: existing.map((e) => ({ name: e.name, meta: e.meta, src: e.src, bg: S.existing === e.id ? 'var(--hover)' : 'transparent', tick: S.existing === e.id ? '✓' : '', pick: () => this.setState({ existing: e.id }) })),
      upFoot: src === 'cloud' ? (S.cs === 'done' ? (S.mode === 'new' ? 'Creates “' + (name || today) + '”' : 'Adds to “' + (ex ? ex.name : '') + '”') : 'Syncs the ticked folders') : !nFiles ? 'Up to 2,000 files at a time' : S.mode === 'new' ? 'Creates “' + (name || P.suggestName || today) + '”' : 'Adds to “' + (ex ? ex.name : '') + '”',
      upGoOp: src === 'cloud' ? (anyCl ? (S.cs === 'busy' ? 0.6 : 1) : 0.4) : (nFiles && !uploading ? 1 : 0.4),
      upGoLabel: src === 'cloud' ? (S.cs === 'busy' ? 'Syncing…' : S.cs === 'done' ? 'Add ' + S.found + ' photos' : 'Sync now') : uploading ? 'Uploading…' : nFiles ? 'Upload ' + nFiles + ' photos' : 'Upload',
      upGo: () => (src === 'cloud' ? goCloud() : goUpload()),
      toast: S.toast, toastOp: S.tOp, cloudOn: co, localOn: lo,
    };
  }

  renderVals() {
    const S = this.state, P = this.props;
    const shootsAfter = (P.shoots || []).map((s) => ({ ...s, open: () => P.onOpenShoot(s.id) }));
    return { shootsAfter, ...this.upVals(), ...this.shootView() };
  }
}
