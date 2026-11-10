/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Community.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  Q = [[9, 'Photographer #4821', 'Pentax 67 · 105mm · Portra 160', 'Coast, WA', 4.2, 31], [2, 'Photographer #1190', 'Nikon FM2 · 50mm · HP5', 'Forest, VIC', 3.9, 18], [5, 'Photographer #7702', 'Fujifilm X100V', 'Street, NSW', 3.6, 44], [1, 'Photographer #0356', 'Leica M6 · Gold 200', 'Countryside, TAS', 4.4, 27], [6, 'Photographer #2215', 'Sony A7 IV · 85mm', 'Studio, QLD', 4.0, 12], [3, 'Photographer #9043', 'Canon AE-1 · Ektar 100', 'Park, WA', 3.8, 22]];
  state = { i: 0, mine: null, note: '', rep: false, reason: null, repNote: '', done: 0, fade: 1 };
  componentDidMount() { this.onKey = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || this.state.rep) return; if (/^[1-5]$/.test(e.key)) this.setState({ mine: +e.key }); }; window.addEventListener('keydown', this.onKey); }
  componentWillUnmount() { window.removeEventListener('keydown', this.onKey); clearTimeout(this.tT); clearTimeout(this.fT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2000); }
  advance(extra = {}) { this.setState({ fade: 0 }); clearTimeout(this.fT); this.fT = setTimeout(() => this.setState((s) => ({ i: s.i + 1, mine: null, note: '', fade: 1, ...extra })), 180); }
  renderVals() {
    const S = this.state; const q = this.Q[S.i]; const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const RS = [['nudity', 'Nudity or sexual content', 'Should have been marked adult'], ['violence', 'Violence or gore', 'Graphic injury, cruelty or weapons aimed at people'], ['adult', 'Other adult content', 'Drugs, self-harm or anything not for everyone'], ['stolen', 'Not their photo', 'Taken from someone else'], ['spam', 'Spam or not a photo', 'Ads, screenshots or text'], ['other', 'Something else', 'Tell us below']];
    return {
      hasCur: !!q, allDone: !q, restart: () => this.setState({ i: 0, done: 0 }),
      cur: q ? { src: `photos/p${q[0]}.jpg`, who: q[1], kit: q[2], where: q[3] } : { src: '', who: '', kit: '', where: '' }, fade: S.fade,
      progress: Math.min(S.i + 1, this.Q.length) + ' of ' + this.Q.length + ' today · ' + S.done + ' rated',
      rateTitle: S.mine ? 'You said ' + R[S.mine - 1][1] : 'How good is it?', rated: !!S.mine,
      othersFg: S.mine ? '#a8a59f' : '#6f6c67', others: !q ? '' : !S.mine ? 'Rate it to see what others thought. Your note goes to the photographer without your name.' : `Others rated it ${q[4].toFixed(1)} on average (${q[5]} ratings). Your note goes to the photographer without your name.`,
      rates: R.map(([emoji, label], i) => ({ emoji, label, bg: S.mine === i + 1 ? 'rgba(255,255,255,.12)' : 'transparent', fg: S.mine === i + 1 ? '#efede8' : '#a8a59f', op: S.mine && S.mine !== i + 1 ? 0.45 : 1, pick: () => this.setState({ mine: i + 1 }) })),
      note: S.note, onNote: (e) => this.setState({ note: e.target.value }),
      nextOp: S.mine ? 1 : 0.4, next: () => { if (!S.mine) return; this.advance({ done: S.done + 1 }); },
      skip: () => this.advance(),
      mine: [['38', 'shared'], ['212', 'ratings received'], ['4.1', 'average'], [String(146 + S.done), 'you’ve reviewed']].map(([v, l]) => ({ v, l })),
      repOpen: S.rep, openRep: () => this.setState({ rep: true, reason: null, repNote: '' }), closeRep: () => this.setState({ rep: false }), stop: (e) => e.stopPropagation(),
      reasons: RS.map(([k, label, hint]) => ({ label, hint, bg: S.reason === k ? 'rgba(255,255,255,.06)' : 'transparent', ring: S.reason === k ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: S.reason === k ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => this.setState({ reason: k }) })),
      repNote: S.repNote, onRepNote: (e) => this.setState({ repNote: e.target.value }), repOp: S.reason ? 1 : 0.4,
      sendRep: () => { if (!S.reason) return; this.setState({ rep: false }); this.flash('Reported · it’s hidden and sent to moderators'); this.advance(); },
      toast: S.toast || '', toastOp: S.tOp || 0,
    };
  }
}
