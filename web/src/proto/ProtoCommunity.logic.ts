/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Proto Community.dc.html. Behaviour is the spec; the photo, the stats and the actions come in
// through props (see screens/Community.tsx).
import { DCLogic } from './runtime';

export class Logic extends DCLogic {
  state = { mine: null, note: '', rep: false, reason: null, repNote: '', fade: 1, toast: '', tOp: 0 };
  componentDidMount() { this.onKey = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || this.state.rep) return; if (/^[1-5]$/.test(e.key)) this.setState({ mine: +e.key }); if (e.key === 'Enter' && this.state.mine) this.next(); }; window.addEventListener('keydown', this.onKey); }
  componentWillUnmount() { window.removeEventListener('keydown', this.onKey); clearTimeout(this.tT); clearTimeout(this.fT); }
  flash(t) { this.setState({ toast: t, tOp: 1 }); clearTimeout(this.tT); this.tT = setTimeout(() => this.setState({ tOp: 0 }), 2600); }
  async advance(fn) { this.setState({ fade: 0 }); await fn(); clearTimeout(this.fT); this.fT = setTimeout(() => this.setState({ mine: null, note: '', fade: 1 }), 120); }
  async next() { const S = this.state; if (!S.mine) return; await this.advance(() => this.props.onRate(S.mine, S.note)); }
  renderVals() {
    const S = this.state, P = this.props; const q = P.cur;
    const R = [['😐', 'meh'], ['🙂', 'fine'], ['😊', 'good'], ['😄', 'great'], ['😍', 'love']];
    const RS = [['nudity', 'Nudity or sexual content', 'Should have been marked adult'], ['violence', 'Violence or gore', 'Graphic injury, cruelty or weapons aimed at people'], ['adult', 'Other adult content', 'Drugs, self-harm or anything not for everyone'], ['stolen', 'Not their photo', 'Taken from someone else'], ['spam', 'Spam or not a photo', 'Ads, screenshots or text'], ['other', 'Something else', 'Tell us below']];
    const o = P.others;
    return {
      hasCur: !!q, allDone: !q && !P.loading, restart: P.onRestart,
      cur: q || { src: '', who: '', kit: '', where: '' }, fade: S.fade,
      progress: P.progress,
      rateTitle: S.mine ? 'You said ' + R[S.mine - 1][1] : 'How good is it?', rated: !!S.mine,
      othersFg: S.mine ? '#a8a59f' : '#6f6c67',
      others: !q ? '' : !S.mine ? 'Rate it to see what others thought. Your note goes to the photographer without your name.' : (o && o.n > 0 ? `Others rated it ${o.avg.toFixed(1)} on average (${o.n} ratings). ` : 'No one else has rated it yet. ') + 'Your note goes to the photographer without your name.',
      rates: R.map(([emoji, label], i) => ({ emoji, label, bg: S.mine === i + 1 ? 'rgba(255,255,255,.12)' : 'transparent', fg: S.mine === i + 1 ? '#efede8' : '#a8a59f', op: S.mine && S.mine !== i + 1 ? 0.45 : 1, pick: () => this.setState({ mine: i + 1 }) })),
      note: S.note, onNote: (e) => this.setState({ note: e.target.value }),
      nextOp: S.mine ? 1 : 0.4, next: () => this.next(),
      skip: () => this.advance(() => P.onSkip()),
      mine: P.mineStats || [],
      repOpen: S.rep, openRep: () => this.setState({ rep: true, reason: null, repNote: '' }), closeRep: () => this.setState({ rep: false }), stop: (e) => e.stopPropagation(),
      reasons: RS.map(([k, label, hint]) => ({ label, hint, bg: S.reason === k ? 'rgba(255,255,255,.06)' : 'transparent', ring: S.reason === k ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: S.reason === k ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => this.setState({ reason: k }) })),
      repNote: S.repNote, onRepNote: (e) => this.setState({ repNote: e.target.value }), repOp: S.reason ? 1 : 0.4,
      sendRep: async () => { if (!S.reason) return; this.setState({ rep: false }); this.flash('Reported · it’s hidden and sent to moderators'); await this.advance(() => P.onReport(S.reason, S.repNote)); },
      toast: S.toast, toastOp: S.tOp,
    };
  }
}
