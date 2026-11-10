/* eslint-disable */
// @ts-nocheck
// Ported from the logic class in design_handoff_frames/prototype/Settings Interactive.dc.html. Behaviour is the spec; sample data is replaced by real data passed in props.
import { DCLogic } from './runtime';


export class Logic extends DCLogic {
  state = (() => { const g = window.__framesSettingsGo; window.__framesSettingsGo = null; return { tab: (g && g.tab) || this.props.startTab || 'lib', sec: { lib: this.props.startSection || 'reviews', srv: (g && g.tab === 'srv' && g.sec) || 'signin' }, q: '', vals: {}, open: null, toast: '' }; })();
  componentDidMount() { this.onGo = (e) => { const g = e.detail || {}; window.__framesSettingsGo = null; this.setState((x) => ({ tab: g.tab || x.tab, q: '', sec: { ...x.sec, [g.tab || x.tab]: g.sec || x.sec[g.tab || x.tab] } })); }; window.addEventListener('frames-settings-go', this.onGo); }
  componentWillUnmount() { window.removeEventListener('frames-settings-go', this.onGo); clearTimeout(this.tt); clearTimeout(this.envT); clearTimeout(this.cfT); }
  openEnv(get) {
    const yes = (v) => (v ? 'true' : 'false');
    const txt = ['# Frames server · edited here or in docker-compose', '# Lines starting with # are ignored. Changes apply after a restart.', '',
      '# Cloudflare tunnel (Frames sets it up through the API)', 'CLOUDFLARE_API_TOKEN=' + (get('cfApiToken') || ''), 'CLOUDFLARE_ACCOUNT_ID=' + get('cfAccount'), 'TUNNEL_NAME=Frames', 'APP_HOSTNAME=' + String(get('appUrl')).replace(/^https?:\/\//, ''), 'ACCESS_EMAILS=' + (get('cfWho') === 'Members' ? 'trent@example.com,mia@example.com,sam@example.com' : ''), 'PORTFOLIO_HOSTNAME=photography.trent.au', '',
      '# Storage', 'FRAMES_LIBRARY=' + get('libPath'), 'FRAMES_CACHE=' + get('cachePath'), 'FRAMES_CACHE_LIMIT=' + String(get('cacheMax')).replace(' ', ''), 'FRAMES_WORKERS=' + get('workers'), 'FRAMES_RAW_PREVIEW=' + (get('rawMode') === 'Full decode' ? 'full' : 'embedded'), '',
      '# Email', 'SMTP_ENABLED=' + yes(get('mailOn')), 'SMTP_HOST=' + get('smtpHost'), 'SMTP_PORT=' + String(get('smtpPort')).split(' ')[0], 'SMTP_USER=' + get('smtpUser'), 'SMTP_PASS=' + get('smtpPass'), 'SMTP_FROM=' + get('mailFrom'), '',
      '# System', 'FRAMES_UPDATE_CHANNEL=' + String(get('channel')).toLowerCase(), 'FRAMES_LOG_LEVEL=' + String(get('logLevel')).toLowerCase()].join('\n');
    this.setState({ env: { text: txt, orig: txt, saved: false, restarting: false } });
  }
  defs() {
    const ROLES = ['Admin', 'Member', 'Guest only'];
    const ph = (ns) => ns.map((n) => `photos/p${n}.jpg`);
    return {
      lib: [
        { key: 'profile', name: 'Profile', hint: 'How you appear to guests and on your portfolio.', groups: [
          { title: '', rows: [
            { id: 'avatar', t: 'link', avatar: true, label: 'Picture', hint: 'Shown to guests and on your portfolio.', meta: 'Change', toast: 'Would open the picture picker' },
            { id: 'name', t: 'text', label: 'Display name', def: 'Trent Bauer' },
            { id: 'country', t: 'select', label: 'Country', hint: 'Sets your hemisphere, so photo seasons are right. Shown on your portfolio.', opts: ['Australia', 'New Zealand', 'South Africa', 'Argentina', 'Brazil', 'Chile', 'Canada', 'France', 'Germany', 'Ireland', 'Japan', 'Netherlands', 'United Kingdom', 'United States'], def: (() => { try { return localStorage.getItem('frames-country') || 'Australia'; } catch (e) { return 'Australia'; } })() },
            { id: 'email', t: 'text', label: 'Email', hint: 'For sign-in and guest replies.', def: 'trent@example.com' },
            ] },
          { title: 'Sign-in methods · the ones your admin turned on', rows: [
            { id: 'uEmailCode', t: 'link', icon: '@', label: 'Email code', hint: 'Always on · a 6-character code sent to your email', meta: '', toast: '' },
            { id: 'password', t: 'link', icon: 'PK', label: 'Passkeys', hint: '2 devices · this Mac, iPhone', meta: 'Manage', toast: 'Would open passkey settings: add, rename or remove devices' },
            { id: 'uCf', t: 'link', icon: 'CF', label: 'Cloudflare Access', hint: 'Signs you in automatically through frames.trent.au', meta: '', toast: '' },
            { id: 'uGoogle', t: 'link', icon: 'G', label: 'Google', hint: 'Not linked', meta: 'Link', toast: 'Would open Google to link trent@example.com' } ] },
          { title: 'Preferences', rows: [
            { id: 'theme', t: 'seg', label: 'Theme', hint: 'Dark unless you change it.', opts: ['Dark', 'Light'], def: document.documentElement.getAttribute('data-theme') === 'light' ? 'Light' : 'Dark' },
            { id: 'start', t: 'select', label: 'Open Frames on', opts: ['Home', 'Library', 'Shoots', 'Compositions'], def: 'Home' },
            { id: 'units', t: 'seg', label: 'Print sizes in', opts: ['cm', 'inches'], def: 'cm' },
            { id: 'dateFmt', t: 'select', label: 'Dates', opts: ['9 Nov 2026', '09/11/2026', '2026-11-09', 'Nov 9, 2026'], def: '9 Nov 2026' } ] } ] },
        { key: 'notifications', name: 'Notifications', hint: 'What shows in the bell, and what gets emailed.', groups: [
          { title: 'Show in the bell', rows: [
            { id: 'nGuest', t: 'toggle', label: 'Guest ratings and suggestions', def: true },
            { id: 'nComm', t: 'toggle', label: 'Community reviews of my photos', def: true },
            { id: 'nIdeas', t: 'toggle', label: 'Composition ideas', def: true },
            { id: 'nSync', t: 'toggle', label: 'Cloud photos ready to organise', def: true },
            { id: 'nDue', t: 'toggle', label: 'Photos due for review', def: false },
            { id: 'nReport', t: 'toggle', label: 'Outcomes of photos I reported', def: true } ] },
          { title: 'Email me', rows: [
            { id: 'notify', t: 'toggle', label: 'When a guest replies', def: true },
            { id: 'remind', t: 'select', label: 'Review reminders', hint: 'Only when photos are due.', opts: ['Off', 'Daily', 'Weekly'], def: 'Weekly' },
            { id: 'digest', t: 'toggle', label: 'Monthly summary', hint: 'Photos added, rated and printed.', def: false },
            { id: 'nEmailSec', t: 'toggle', label: 'New sign-ins to my account', hint: 'Always on for admins.', def: true } ] },
          { title: 'Quiet hours', rows: [
            { id: 'quiet', t: 'toggle', label: 'Hold emails overnight', hint: 'Sent at 8am instead.', def: false } ] } ] },
        { key: 'reviews', name: 'Reviews', hint: 'When photos come back for a rating.', badge: '12', groups: [
          { title: '', rows: [
            { id: 'sessions', t: 'stepper', label: 'Sessions per photo', hint: 'Each photo is rated this many times.', def: 5, min: 1, max: 8 },
            { id: 'spacing', t: 'seq', label: 'Spacing', hint: 'The wait before each next session. Click to change.', opts: ['1 day', '3 days', '1 week', '2 weeks', '1 month', '3 months', '6 months', '1 year'], def: ['1 day', '1 day', '1 week', '1 week', '1 week'] },
            { id: 'adapt', t: 'toggle', label: 'Adapt to consistency', hint: 'Steady ratings come back less often.', def: true },
            { id: 'daily', t: 'stepper', label: 'Photos per review', hint: 'How many are offered at once.', def: 12, min: 4, max: 60, step: 4 },
            { id: 'scale', t: 'seg', label: 'Rating scale', opts: ['😐 → 😍', '★ 1–5'], def: '😐 → 😍' },
            { id: 'blind', t: 'toggle', label: 'Hide scores while rating', hint: 'Keeps each rating independent.', def: true } ] },
          { title: 'Ranking', rows: [
            { id: 'weight', t: 'seg', label: 'Guest ratings count for', hint: 'In composition rankings.', opts: ['0%', '20%', '35%', '50%'], def: '35%' },
            { id: 'newBoost', t: 'toggle', label: 'Review new shoots first', hint: 'Fresh photos jump the queue.', def: true } ] },
          { title: 'Community', rows: [
            { id: 'community', t: 'toggle', label: 'Let other Frames users review my photos', hint: 'Anonymous both ways. Their scores stay separate from yours and your guests’.', note: 'Photos tagged nudity, violence or adult are never shown to the community.', def: false },
            { id: 'commFrom', t: 'select', label: 'Share', dep: 'community', opts: ['Portfolio photos only', 'Photos rated 4 or more', 'Any photo'], def: 'Any photo' },
            { id: 'commNotes', t: 'toggle', label: 'Allow written feedback', dep: 'community', def: true },
            { id: 'commHome', t: 'toggle', label: 'Show Community review on Home', hint: 'Rate other photographers’ work.', def: true } ] },
          { title: 'Clean-up', rows: [
            { id: 'suggestRemove', t: 'toggle', label: 'Suggest removing low-rated photos', hint: 'After every session. Nothing is removed without asking.', def: true },
            { id: 'removeBelow', t: 'select', label: 'Averaging below', dep: 'suggestRemove', opts: ['1.0', '1.5', '2.0', '2.5', '3.0'], def: '2.0' },
            { id: 'removeVotes', t: 'select', label: 'Over at least', hint: 'Ratings from you and guests combined.', dep: 'suggestRemove', opts: ['3 votes', '5 votes', '8 votes', '12 votes', '20 votes'], def: '5 votes' },
            { id: 'suggested', t: 'link', label: 'Suggested now', dep: 'suggestRemove', meta: '312 photos', toast: 'Would open the 312 suggestions' },
            { id: 'leaveOut', t: 'toggle', label: 'Suggest leaving low-rated photos out of review', hint: 'They stay in your library and compositions.', def: false } ] },
          { title: 'To do list counts photos missing', rows: [
            { id: 'todo', t: 'chips', label: 'Missing', opts: ['Camera', 'Location', 'Time', 'Subjects', 'Tags', 'Description', 'Composition', 'Light', 'Mood'], def: ['Camera', 'Location', 'Subjects', 'Tags', 'Composition'] } ] } ] },
        { key: 'tags', name: 'Tags & subjects', hint: 'How photos get described and found.', groups: [
          { title: 'Subjects', rows: [
            { id: 'aiSubjects', t: 'toggle', label: 'Suggest subjects with AI', hint: 'Suggestions wait for you to accept.', def: true },
            { id: 'autoAccept', t: 'select', label: 'Accept automatically above', dep: 'aiSubjects', opts: ['Never', '80% sure', '90% sure', '95% sure'], def: '95% sure' },
            { id: 'subjects', t: 'pills', label: 'Your subjects', hint: 'Used for filters and portfolio buttons.', def: ['portrait', 'landscape', 'car', 'street', 'forest'], addAs: 'new subject' } ] },
          { title: 'Sensitive content', rows: [
            { id: 'sensAiLink', t: 'link', label: 'Flag sensitive photos with AI', hint: 'Set which AI does this in AI → Which AI does what.', meta: 'AI settings', toast: 'Would jump to AI settings' },
            { id: 'sensBlur', t: 'toggle', label: 'Blur flagged photos for guests', hint: 'They click to reveal.', def: true },
            { id: 'sensPf', t: 'toggle', label: 'Keep flagged photos off my portfolio', def: false },
            { id: 'sensList', t: 'link', label: 'Flagged photos', hint: 'Never shown in community review.', meta: '23 photos', toast: 'Would open the 23 flagged photos' } ] },
          { title: 'Tags', rows: [
            { id: 'autoTags', t: 'chips', label: 'Tag automatically from', opts: ['Camera', 'Lens', 'Film', 'Place', 'Season'], def: ['Camera', 'Film', 'Place'] },
            { id: 'merge', t: 'link', label: 'Similar tags', hint: '“autumn” and “fall”, for example.', meta: '12 pairs to merge', toast: 'Would open the merge list' },
            { id: 'hidden', t: 'pills', label: 'Hidden tags', hint: 'Never shown to guests or on the portfolio.', def: ['home', 'family'], addAs: 'private' },
            { id: 'tagList', t: 'link', label: 'All tags', meta: '612 tags', toast: 'Would open the tag list' } ] } ] },
        { key: 'xmp', name: 'Camera & XMP', hint: 'What Frames writes back to your files.', groups: [
          { title: 'XMP sidecars', rows: [
            { id: 'xmpRatings', t: 'toggle', label: 'Write ratings', hint: 'Lightroom and Capture One will see them.', def: true },
            { id: 'xmpMap', t: 'select', label: 'Map scores to', dep: 'xmpRatings', opts: ['Stars (1–5)', 'Colour labels', 'Both'], def: 'Stars (1–5)' },
            { id: 'xmpTags', t: 'toggle', label: 'Write tags and subjects', def: true },
            { id: 'xmpRead', t: 'toggle', label: 'Read edits from other apps', hint: 'Keeps keywords in sync both ways.', def: false } ] },
          { title: 'Cameras', rows: [
            { id: 'camGear', t: 'button', label: 'Your cameras and lenses', hint: 'Managed on the Gear page. Cameras found in your photos are suggested there.', meta: 'Open gear →', toast: 'gear' },
            { id: 'film', t: 'text', label: 'Default film stock', hint: 'For scans without camera data.', def: '', ph: 'Portra 400' },
            { id: 'filmTag', t: 'toggle', label: 'Ask for the film on new scans', def: true } ] } ] },
        { key: 'ai', name: 'AI', hint: 'Connect one or more providers, then set the order each job tries them in.', action: { label: '+ Add AI', toast: '', modal: 'ai' }, groups: [
          { title: 'Providers', rows: [
            { id: 'aiClaude', t: 'link', icon: 'CL', label: 'Claude', hint: 'Connected · claude-sonnet · key ••3f9a · $3.40 of $10 this month', meta: 'Manage', toast: 'Would open Claude: key, model, test, remove' },
            { id: 'aiOllama', t: 'link', icon: 'OL', label: 'Local (Ollama)', hint: 'Shared by this server · llava · free, slower', meta: 'Shared', toast: 'Shared AI is managed by an admin in Server → AI' },
            ...((this.state && this.state.aiShared) || []).map((x, i) => ({ id: 'aiSU' + i, t: 'link', icon: x.icon, label: x.name, hint: 'Shared by this server · ' + x.detail.split(' · key')[0], meta: 'Shared', toast: 'Shared AI is managed by an admin in Server → AI' })),
            ...((this.state && this.state.aiExtra) || []).map((x, i) => ({ id: 'aiX' + i, t: 'link', icon: x.icon, label: x.name, hint: 'Connected just now · ' + x.detail, meta: 'Manage', toast: 'Would open ' + x.name + ' settings' })) ] },
          { title: 'Which AI does what · tried in order', rows: [
            { id: 'aiSearchO', t: 'order', tog: 'aiSearchOOn', label: 'Search by description', hint: 'Runs often, so a local model first keeps costs down.', def: ['Local (Ollama)', 'Claude'] },
            { id: 'aiSearchOOn', t: 'hidden', def: true },
            { id: 'aiDescribeO', t: 'order', tog: 'aiDescribeOOn', label: 'Describe and tag photos', hint: 'Titles, captions, alt text and tags for Analyze with AI.', def: ['Claude', 'Local (Ollama)'] },
            { id: 'aiDescribeOOn', t: 'hidden', def: true },
            { id: 'aiSensO', t: 'order', tog: 'aiSensOOn', label: 'Flag sensitive photos', hint: 'Suggests nudity, violence or adult tags for you to confirm.', def: ['Local (Ollama)', 'Claude'] },
            { id: 'aiSensOOn', t: 'hidden', def: true },
            { id: 'aiIdeasO', t: 'order', tog: 'aiIdeasOOn', label: 'Composition ideas on Home', hint: 'Groups photos by tags and colour.', def: ['Claude', 'Local (Ollama)'] },
            { id: 'aiIdeasOOn', t: 'hidden', def: true }, ] },
          { title: 'Limits & privacy', rows: [
            { id: 'aiLimit', t: 'select', label: 'Monthly limit across paid providers', hint: 'When it’s reached, jobs move to a free provider or wait.', opts: ['$5', '$10', '$25', 'No limit'], def: '$10' },
            { id: 'aiPrivate', t: 'toggle', label: 'Skip photos with hidden tags', hint: 'They’re never sent to any provider.', def: true },
            { id: 'aiLocalOnly', t: 'toggle', label: 'Keep private shoots on local AI only', hint: 'Shoots marked private never leave this server.', def: true } ] } ] },
        { key: 'cloud', name: 'Cloud folders', hint: 'Bring photos in from other places.', groups: [
          { title: 'Connected', rows: [
            { id: 'gdrive', t: 'link', icon: 'GD', label: 'Google Drive', hint: 'Connected · /Camera uploads · 2,140 photos', meta: 'Manage', toast: 'Would open Google Drive settings' },
            { id: 'icloud', t: 'link', icon: 'iC', label: 'iCloud Photos', hint: 'Connected · shared album “Frames”', meta: 'Manage', toast: 'Would open iCloud settings' },
            { id: 'dropbox', t: 'button', icon: 'DB', dim: true, label: 'Dropbox', hint: 'Not connected', meta: 'Connect', toast: 'Would start Dropbox sign-in' } ] },
          { title: 'Importing', rows: [
            { id: 'syncEvery', t: 'select', label: 'Check for new photos', opts: ['Every 15 min', 'Every hour', 'Every 6 hours', 'Manually'], def: 'Every hour' },
            { id: 'grouping', t: 'select', label: 'File new photos as', opts: ['One shoot per day', 'One shoot per folder', 'Ask each time'], def: 'One shoot per day' },
            { id: 'cloudFullRes', t: 'toggle', label: 'Save original resolution', hint: 'Full-size files, as uploaded. Off: a 4096 px copy, about a tenth of the space.', def: true },
            { id: 'skipDupes', t: 'toggle', label: 'Skip duplicates', hint: 'Matched by content, not filename.', def: true },
            { id: 'cloudRO', t: 'link', label: 'Read-only', hint: 'Frames only copies from cloud folders. It never deletes, moves or changes files there.', meta: '', toast: '' } ] } ] },
        { key: 'portfolio', name: 'Portfolio', hint: 'A public website of your best work.', action: { label: 'View site ↗', toast: 'Would open photography.trent.au', to: 'portfolio' }, groups: [
          { title: '', rows: [
            { id: 'pfLive', t: 'toggle', label: 'Published', hint: 'Live at photography.trent.au · 184 photos', def: true },
            { id: 'pfHost', t: 'text', label: 'Web address', hint: '', dep: 'pfLive', def: 'photography.trent.au', ph: 'photography.example.com' } ] },
          { title: 'What’s shown', rows: [
            { id: 'pfFavs', t: 'link', thumbs: ph([9, 3, 5, 10]), label: '★ Favourites · 8', hint: 'Pinned to the top. Only you add these.', meta: 'Arrange', toast: 'Would open Favourites to drag into order' },
            { id: 'pfAutoMin', t: 'selTog', tog: 'pfAuto', label: 'Add photos automatically', hint: 'Any photo whose combined score reaches the threshold. 135 photos right now.', prefix: 'Score ', opts: ['3.5 or more', '4.0 or more', '4.5 or more'], def: '4.0 or more' },
            { id: 'pfAuto', t: 'hidden', def: true },
            { id: 'pfHand', t: 'link', label: 'Added by hand · 41', hint: 'From a photo’s page or a Library selection.', meta: 'See all', toast: 'Would list the 41 photos' },
            { id: 'pfOut', t: 'link', label: 'Left out · 6', hint: 'Never shown, even if they meet the score.', meta: 'See all', toast: 'Would list the 6 photos' },
            { id: 'pfOrder', t: 'select', label: 'Order', opts: ['Newest taken first', 'Newest added first', 'Oldest first', 'By score'], def: 'Newest taken first' } ] },
          { title: 'The site', rows: [
            { id: 'pfName', t: 'link', avatar: true, label: 'Name & picture', hint: 'From your profile', meta: 'Edit', toast: 'profile' },
            { id: 'pfTagline', t: 'text', label: 'Tagline', def: 'Film and digital, Perth WA', ph: 'Film photographer from…' },
            { id: 'pfAccent', t: 'swatch', label: 'Accent', opts: [['Clay', 'oklch(0.58 0.13 35)'], ['Blue', 'oklch(0.55 0.11 250)'], ['Green', 'oklch(0.58 0.1 150)'], ['Ink', '#2a2a28']], def: 'Clay' },
            { id: 'pfButtons', t: 'pills', label: 'Menu links', hint: 'Shown after Index, Favourites and Gear, in this order.', def: ['Instagram ↗', 'eBay ↗', 'Resume ↗', 'FilmCalc ↗'], addAs: 'Website ↗' },
            { id: 'pfGear', t: 'button', label: 'Gear page', hint: 'Synced from your gear list. The want-to-buy list is optional.', meta: 'Open gear →', toast: 'gear' },
            { id: 'pfFull', t: 'seg', label: 'Opening a photo shows', hint: 'Camera data is removed from resized copies.', opts: ['Resized', 'Original', 'Nothing'], def: 'Resized' },
            { id: 'pfFilters', t: 'toggle', label: 'Subject filters', hint: 'Buttons above “All work”.', def: true } ] } ] },
        { key: 'data', name: 'Your data', hint: 'Take everything with you.', groups: [
          { title: 'Storage', rows: [
            { id: 'stLib', t: 'meter', label: 'Library', hint: '48,210 photos · originals untouched', pct: 62, text: '412 GB of 660 GB' },
            { id: 'stCache', t: 'button', label: 'Previews & thumbnails', hint: '18 GB · rebuilt when needed', meta: 'Clear', toast: 'Previews cleared · they’ll rebuild in the background' } ] },
          { title: 'Export', rows: [
            { id: 'exportAll', t: 'button', label: 'Everything', hint: 'Ratings, tags and compositions as JSON.', meta: 'Export', toast: 'Export started · we’ll email you' },
            { id: 'exportCsv', t: 'button', label: 'Ratings as CSV', meta: 'Download', toast: 'Downloading ratings.csv' },
            { id: 'exportXmp', t: 'button', label: 'Write all XMP sidecars now', hint: '48,210 files · about 6 minutes', meta: 'Write', toast: 'Writing XMP sidecars' } ] },
          { title: 'Danger zone', rows: [
            { id: 'resetRatings', t: 'button', danger: true, label: 'Reset all ratings', hint: 'Scores start again. Photos stay.', meta: 'Reset…', toast: 'Would ask you to confirm' },
            { id: 'del', t: 'button', danger: true, label: 'Delete my account', hint: 'Photos on disk are not touched.', meta: 'Delete…', toast: 'Would ask you to type your name to confirm' } ] } ] },
      ],
      srv: [
        { key: 'signin', name: 'Sign-in & access', hint: 'How people get in.', groups: [
          { title: 'Sign-in methods · test before turning on', rows: [
            { id: 'm_passkey', t: 'method', icon: 'PK', label: 'Passkey', hint: 'Face ID, Touch ID or a security key. Built in.', def: true, test: 'pass' },
            { id: 'm_cf', t: 'method', icon: 'CF', label: 'Cloudflare Access', hint: 'No sign-in screen: Access vouches for the email.', def: true, test: 'pass' },
            { id: 'm_google', t: 'method', icon: 'G', label: 'Google', hint: 'Sign in with a Google account.', def: false, test: 'pass' },
            { id: 'm_github', t: 'method', icon: 'GH', label: 'GitHub', hint: 'Sign in with a GitHub account.', def: false },
            { id: 'm_dropbox', t: 'method', icon: 'DB', label: 'Dropbox', hint: 'Sign in with a Dropbox account.', def: false },
            { id: 'm_ms', t: 'method', icon: 'MS', label: 'Microsoft', hint: 'Work or school (Entra ID). Needs your tenant ID.', def: false, failWith: 'No tenant ID yet' },
            { id: 'm_oidc', t: 'method', icon: 'ID', label: 'OpenID Connect', hint: 'Authentik, Keycloak, Authelia or any OIDC server.', def: false, failWith: 'Issuer address not set' },
            { id: 'm_oauth', t: 'method', icon: 'O2', label: 'Other OAuth 2', hint: 'Anything that gives out OAuth 2 tokens.', def: false, failWith: 'Token address not set' } ] },
          { title: 'Sessions', rows: [
                        { id: 'signup', t: 'toggle', label: 'Allow anyone to sign up', hint: 'Off: invite only.', def: false },
            { id: 'newRole', t: 'select', label: 'New people join as', opts: ROLES, def: 'Member' },
            { id: 'session', t: 'select', label: 'Stay signed in for', opts: ['1 day', '1 week', '30 days', '90 days'], def: '30 days' } ] },
          { title: 'Guest links', rows: [
            { id: 'guestExpiry', t: 'select', label: 'Expire after', opts: ['1 week', '3 weeks', '3 months', 'Never'], def: '3 weeks' },
            { id: 'guestDl', t: 'toggle', label: 'Guests can download files', def: false },
            { id: 'guestName', t: 'toggle', label: 'Ask guests for their name', hint: 'So you know whose ratings are whose.', def: true } ] } ] },
        { key: 'people', name: 'Members', hint: 'Who can sign in to this Frames.', action: { label: '+ Invite', toast: '', modal: 'invite' }, groups: [
          { title: 'Members', rows: [
            { id: 'pStorage', t: 'meter', label: 'Storage used', hint: 'Trent 318 GB · Mia 86 GB · shared cache 19 GB', pct: 64, text: '423 GB of 660 GB' },
            { id: 'p1', t: 'select', icon: 'TB', label: 'Trent Bauer', hint: 'trent@example.com · you · 318 GB · 41,960 photos', opts: ROLES, def: 'Admin' },
            { id: 'p2', t: 'select', icon: 'MC', label: 'Mia Chen', hint: 'mia@example.com · last seen today · 86 GB · 6,250 photos (41 GB from the cloud)', opts: ROLES, def: 'Member' },
            { id: 'p3', t: 'select', icon: 'SO', label: 'Sam Ortiz', hint: 'sam@example.com · invited 2 days ago · guests store nothing', opts: ROLES, def: 'Guest only' },
            ...((this.state && this.state.invites) || []).map((x, i) => ({ id: 'inv' + i, t: 'select', icon: x.email.slice(0, 2).toUpperCase(), label: x.email, hint: 'Invite sent just now · not signed in yet · 0 GB', opts: ROLES, def: x.role })) ] },
          { title: 'Defaults', rows: [
            { id: 'shareLib', t: 'toggle', label: 'Members can see each other’s shoots', def: false } ] } ] },
        { key: 'folders', name: 'Photos & storage', hint: 'Where originals live, and the cloud services members can bring photos in from.', groups: [
          { title: '', rows: [
            { id: 'libPath', t: 'text', label: 'Library folder', def: '/mnt/photos', ph: '/path/to/photos' },
            { id: 'disk', t: 'meter', label: 'Disk', hint: '/mnt/photos', pct: 62, text: '412 GB of 660 GB' },
            { id: 'watch', t: 'toggle', label: 'Watch for new files', hint: 'Shows “new files” on Shoots.', def: true },
            { id: 'formats', t: 'chips', label: 'Import', opts: ['JPEG', 'HEIC', 'TIFF', 'RAW'], def: ['JPEG', 'HEIC', 'TIFF', 'RAW'] } ] },
          { title: 'Per-person limit', rows: [
            { id: 'userQuota', t: 'select', label: 'Storage per person', hint: 'Originals each member can keep on this server. Uploads pause at the limit; admins aren’t limited.', opts: ['No limit', '10 GB', '25 GB', '50 GB', '100 GB', '250 GB', '500 GB'], def: 'No limit' } ] },
          { title: 'XMP sidecars', rows: [
            { id: 'sidecar', t: 'seg', label: 'Where sidecar files go', hint: 'For everyone on this server. Next to photo is what Lightroom and Capture One expect.', opts: ['Next to photo', 'Frames folder'], def: 'Next to photo' } ] },
          { title: 'Originals', rows: [
            { id: 'allowOrig', t: 'toggle', label: 'Allow original downloads on portfolios', def: false },
            { id: 'srvFullRes', t: 'toggle', label: 'Allow original resolution from the cloud', hint: 'Off: everyone’s cloud imports are saved as 4096 px copies to save disk space.', def: true },
            { id: 'cloudOnly', t: 'toggle', label: 'Keep originals in cloud storage only', hint: 'Frees disk space on this server. Nothing in the cloud is touched.', def: false } ] },
          { title: 'Cloud providers', rows: [
            { id: 'cpGoogle', t: 'method', icon: 'GD', label: 'Google Drive', hint: 'Uses your Google Cloud OAuth app · client ID set', def: true, test: 'pass' },
            { id: 'cpDropbox', t: 'method', icon: 'DB', label: 'Dropbox', hint: 'Uses your Dropbox app key · set', def: true, test: 'pass' },
            { id: 'cpOneDrive', t: 'method', icon: 'OD', label: 'OneDrive', hint: 'Needs a Microsoft Entra app ID.', def: false, failWith: 'App ID not set' },
            { id: 'cpIcloud', t: 'method', icon: 'iC', label: 'iCloud shared albums', hint: 'Public shared-album links only. No sign-in needed.', def: true, test: 'pass' },
            { id: 'cpS3', t: 'method', icon: 'S3', label: 'S3-compatible', hint: 'AWS S3, Backblaze B2, Cloudflare R2, MinIO.', def: false, test: 'pass' },
            { id: 'cpWebdav', t: 'method', icon: 'WD', label: 'WebDAV / Nextcloud', hint: 'Members enter their own server address.', def: false, test: 'pass' },
            { id: 'cpSmb', t: 'method', icon: 'SM', label: 'Network share (SMB)', hint: 'A NAS folder on your network.', def: false, failWith: 'No share address set' } ] },
          { title: 'Cloud sign-in details', rows: [
            { id: 'cpGoogleId', t: 'text', label: 'Google OAuth client ID', dep: 'cpGoogle', def: '83920••••.apps.googleusercontent.com', inputType: 'password' },
            { id: 'cpGoogleSecret', t: 'text', label: 'Google client secret', dep: 'cpGoogle', def: '••••••••••••', inputType: 'password' },
            { id: 'cpDropboxKey', t: 'text', label: 'Dropbox app key', dep: 'cpDropbox', def: 'k2••••••••9x', inputType: 'password' },
            { id: 'cpRedirect', t: 'link', label: 'Redirect URL', hint: 'https://frames.trent.au/oauth/callback · paste this into each provider’s app settings', meta: 'Copy', toast: 'Copied the redirect URL' } ] },
          { title: 'Cloud rules', rows: [
            { id: 'cpWho', t: 'select', label: 'Who can connect cloud storage', opts: ['Admins and members', 'Admins only'], def: 'Admins and members' },
            { id: 'cpMinSync', t: 'select', label: 'Fastest sync allowed', hint: 'Members can’t check more often than this.', opts: ['Every 15 min', 'Every hour', 'Every 6 hours'], def: 'Every 15 min' },
            { id: 'cpQuota', t: 'select', label: 'Storage per person from the cloud', opts: ['50 GB', '200 GB', '1 TB', 'No limit'], def: '200 GB' },
            { id: 'cpRO', t: 'link', label: 'Read-only', hint: 'Frames only copies from cloud storage. It never deletes, moves or changes files there.', meta: '', toast: '' } ] } ] },
        { key: 'backup', name: 'Backup', hint: 'Ratings, tags and compositions. Not the photos.', action: { label: 'Back up now', toast: 'Backup started' }, groups: [
          { title: '', rows: [
            { id: 'backupOn', t: 'toggle', label: 'Back up automatically', def: true },
            { id: 'backupEvery', t: 'select', label: 'Every', dep: 'backupOn', opts: ['Day', 'Week', 'Month'], def: 'Day' },
            { id: 'backupKeep', t: 'stepper', label: 'Keep the last', dep: 'backupOn', def: 14, min: 1, max: 90 },
            { id: 'backupTo', t: 'select', label: 'Save to', dep: 'backupOn', opts: ['This server', 'Google Drive', 'S3 bucket'], def: 'Google Drive' } ] },
          { title: 'History', rows: [
            { id: 'b1', t: 'button', label: 'Today, 03:00', hint: '41 MB · Google Drive', meta: 'Restore…', toast: 'Would ask you to confirm the restore' },
            { id: 'b2', t: 'button', label: 'Yesterday, 03:00', hint: '41 MB · Google Drive', meta: 'Restore…', toast: 'Would ask you to confirm the restore' } ] } ] },
        { key: 'srvai', name: 'AI', hint: 'AI providers everyone on this server can use.', action: { label: '+ Add shared AI', toast: '', modal: 'aiShared' }, groups: [
          { title: 'Shared with everyone', rows: [
            { id: 'sOllama', t: 'link', icon: 'OL', label: 'Local (Ollama)', hint: 'llava on 192.168.1.20 · free · used by 3 people', meta: 'Manage', toast: 'Would open Ollama: address, model, test, remove' },
            ...((this.state && this.state.aiShared) || []).map((x, i) => ({ id: 'sAi' + i, t: 'link', icon: x.icon, label: x.name, hint: 'Added just now · ' + x.detail, meta: 'Manage', toast: 'Would open ' + x.name + ' settings' })) ] },
          { title: 'Rules', rows: [
            { id: 'sAiWho', t: 'select', label: 'Who can use shared AI', opts: ['Admins and members', 'Admins only'], def: 'Admins and members' },
            { id: 'sAiOwn', t: 'toggle', label: 'Members can add their own AI', hint: 'Their keys, their bill. Shown only to them.', def: true },
            { id: 'sAiCap', t: 'select', label: 'Monthly limit per person', hint: 'For shared paid providers. Free local AI isn’t limited.', opts: ['$2', '$5', '$10', 'No limit'], def: '$5' },
            { id: 'sAiFirst', t: 'toggle', label: 'Put shared AI first for new members', hint: 'Sets the starting order for their jobs. They can change it.', def: true } ] } ] },
        { key: 'network', name: 'Cloudflare tunnel', hint: 'Reach Frames from outside your network without opening ports.', groups: [
          { title: '', rows: [
            { id: 'tunnel', t: 'toggle', label: 'Run the tunnel', hint: 'Connected — Frames can be reached through Cloudflare.', def: true } ] },
          { title: '1 · Let Frames use your Cloudflare account', rows: [
            { id: 'cfIntro', t: 'link', label: 'Frames makes the tunnel, its routes and the DNS records itself', hint: 'And keeps them right when an address changes. It needs your account ID and an API token.', meta: 'How to get them ↗', toast: 'cfHelp' },
            { id: 'cfAccount', t: 'text', label: 'Account ID', hint: 'On the right of the Cloudflare dashboard home page, and in its address after dash.cloudflare.com/.', def: '6d1f0c8a93b44e2f8a71c5d0e9b2a4f7', ph: '32 letters and numbers' },
            { id: 'cfApiToken', t: 'text', label: 'API token', hint: 'Kept on this server only, never shown again, and left out of backups.', def: '', ph: 'Saved. Type to replace', inputType: 'password' },
            { id: 'cfApplied', t: 'link', label: 'Cloudflare is set up', hint: 'Matches the addresses below · 9 Nov 2026, 14:02', meta: 'Details', toast: 'cfStatus' } ] },
          { title: '2 · Addresses', rows: [
            { id: 'appUrl', t: 'text', label: 'App URL', hint: 'The address you open Frames at from outside. Same as the public address under Sign-in & access.', def: 'https://frames.trent.au', ph: 'https://frames.example.com' },
            { id: 'tunnelPf', t: 'toggle', label: 'Portfolios', hint: 'Also serve each person’s portfolio through this tunnel. A portfolio address shows only that person’s public portfolio.', def: true },
            { id: 'cfWho', t: 'seg', label: 'Who can reach the App URL', hint: 'Members: Cloudflare Access only lets in people on your Members list, before Frames even loads. Anyone: Cloudflare lets everyone through; Frames’ own sign-in still applies. Either way, share links and portfolios stay public.', opts: ['Members', 'Anyone'], def: 'Members' },
            { id: 'cfMembers', t: 'link', dep: 'cfWho', depVal: 'Members', label: 'Members', hint: 'trent@example.com, mia@example.com, sam@example.com', meta: 'Open Members →', toast: 'goMembers' } ] },
          { title: '3 · What Frames sets up', rows: [
            { id: 'cfHost1', t: 'link', label: 'frames.trent.au', hint: 'Access: login, allow your Members; share links and portfolio public  →  127.0.0.1:3000', meta: '', toast: '' },
            { id: 'cfHost2', t: 'link', label: 'photography.trent.au', hint: 'Access: public, no login  →  portfolio: Trent (only the public portfolio)', meta: '', toast: '' },
            { id: 'cfHost3', t: 'link', label: 'mia.photos', hint: 'Access: public, no login  →  portfolio: Mia (only the public portfolio)', meta: '', toast: '' } ] },
          { title: 'Cloudflare Access policies', rows: [
            { id: 'cfApp1', t: 'link', label: 'Frames · login required', hint: 'frames.trent.au  ·  Policy: allow your Members', meta: '', toast: '' },
            { id: 'cfApp2', t: 'link', label: 'Frames public · no login', hint: 'frames.trent.au/s/*  frames.trent.au/portfolio/*  photography.trent.au  mia.photos  ·  Policy: bypass (everyone), so share links and portfolios work without a login', meta: '', toast: '' },
            { id: 'tunnelLog', t: 'button', label: 'Tunnel log', hint: 'What cloudflared reported, newest last.', meta: 'Show', toast: 'tunnelLog' } ] } ] },
        { key: 'email', name: 'Email', hint: 'For invites, guest replies and password-free sign-in.', groups: [
          { title: '', rows: [
            { id: 'mailOn', t: 'toggle', label: 'Send email', hint: 'Off: invites and shares are copy-a-link only.', def: true },
            { id: 'smtpHost', t: 'text', label: 'SMTP server', dep: 'mailOn', def: 'smtp.fastmail.com', ph: 'smtp.example.com' },
            { id: 'smtpPort', t: 'select', label: 'Port', dep: 'mailOn', opts: ['465 · SSL', '587 · STARTTLS', '25'], def: '465 · SSL' },
            { id: 'smtpUser', t: 'text', label: 'Username', dep: 'mailOn', def: 'frames@trent.au' },
            { id: 'smtpPass', t: 'text', label: 'Password', dep: 'mailOn', def: '••••••••••••', inputType: 'password' },
            { id: 'mailFrom', t: 'text', label: 'Send as', dep: 'mailOn', def: 'Frames <frames@trent.au>' },
            { id: 'mailTest', t: 'button', label: 'Send a test email', dep: 'mailOn', hint: 'To trent@example.com', meta: 'Send', toast: 'mailTest' } ] },
          { title: 'Sent', rows: [
            { id: 'mailLog', t: 'button', label: 'Email log', hint: 'Last 30 days · 48 sent · 1 failed', meta: 'View', toast: 'mailLog' } ] } ] },
        { key: 'processing', name: 'Storage & processing', hint: 'Thumbnails, previews and background work.', groups: [
          { title: 'Cache', rows: [
            { id: 'cachePath', t: 'text', label: 'Cache folder', hint: 'Thumbnails and previews. Safe to delete; they rebuild.', def: '/config/cache', ph: '/path/to/cache' },
            { id: 'cacheUse', t: 'meter', label: 'Cache size', hint: '/config/cache', pct: 38, text: '19 GB of 50 GB limit' },
            { id: 'cacheMax', t: 'select', label: 'Cache limit', opts: ['10 GB', '25 GB', '50 GB', '100 GB', 'No limit'], def: '50 GB' },
            { id: 'previewSize', t: 'select', label: 'Preview size', hint: 'What you see on the Photo page and in Review.', opts: ['2048 px', '3072 px', '4096 px'], def: '3072 px' } ] },
          { title: 'Processing', rows: [
            { id: 'rawMode', t: 'seg', label: 'RAW previews', hint: 'Embedded is instant; full decode looks better but is slower.', opts: ['Embedded JPEG', 'Full decode'], def: 'Embedded JPEG' },
            { id: 'workers', t: 'stepper', label: 'Background workers', hint: 'More is faster, but uses more CPU while you work.', def: 4, min: 1, max: 16 },
            { id: 'quietHours', t: 'select', label: 'Heavy jobs run', hint: 'Re-indexing, AI tagging and full RAW decodes.', opts: ['Any time', 'Overnight only (1–6 am)', 'When idle'], def: 'When idle' } ] },
          { title: 'Jobs', rows: [
            { id: 'jobQueue', t: 'link', label: 'Queue', hint: '146 thumbnails · 38 AI descriptions · running', meta: 'View', toast: 'Would open the job queue' },
            { id: 'rescan', t: 'button', label: 'Rescan library folder', hint: 'Finds new, moved and deleted files.', meta: 'Rescan', toast: 'Rescan started · 48,210 files' },
            { id: 'rethumbs', t: 'button', label: 'Rebuild thumbnails', meta: 'Rebuild', toast: 'Rebuilding 48,210 thumbnails in the background' },
            { id: 'reindex', t: 'button', label: 'Re-index search', hint: 'Re-reads metadata and AI descriptions.', meta: 'Re-index', toast: 'Re-indexing search in the background' } ] } ] },
        { key: 'server', name: 'Updates & system', hint: 'Version, logs and maintenance.', groups: [
          { title: 'Updates', rows: [
            { id: 'version', t: 'button', label: 'Version', hint: 'v1.17.0 · ghcr.io/trentnbauer/frames:latest', meta: 'Check now', toast: 'You’re on the latest version · update by pulling a new image' },
            { id: 'channel', t: 'seg', label: 'Update channel', opts: ['Stable', 'Beta'], def: 'Stable' },
            { id: 'updPopup', t: 'toggle', label: 'Show admins what’s new after an update', hint: 'From GitHub releases, once per version.', def: true } ] },
          { title: 'Logs & health', rows: [
            { id: 'health', t: 'button', label: 'Health', hint: 'All good · database, library folder, cache, tunnel, email', meta: 'Run checks', toast: 'All 5 checks passed' },
            { id: 'logLevel', t: 'select', label: 'Log level', opts: ['Errors', 'Warnings', 'Info', 'Debug'], def: 'Warnings' },
            { id: 'logs', t: 'button', label: 'Logs', hint: 'Last 7 days · 4.2 MB', meta: 'Show', toast: 'appLog' },
            ] },
          { title: 'Advanced', rows: [
            { id: 'env', t: 'link', label: 'Environment file', hint: 'Compare the app’s settings with /config/frames.env.', meta: 'Show differences', toast: 'envDiff' },
            { id: 'envExport', t: 'button', label: 'Export settings as .env', hint: 'Every server setting on these pages as environment variables, for docker-compose or a fresh install. Secrets are included only if you choose.', meta: 'Export', toast: 'Downloaded frames.env · 64 variables · secrets left blank' },
            { id: 'envSecrets', t: 'toggle', label: 'Include secrets in the export', hint: 'API keys, tunnel token, SMTP password. Keep the file safe.', def: false },
            { id: 'envImport', t: 'button', label: 'Import a .env file', hint: 'Shows what will change before applying.', meta: 'Import…', toast: 'Would show a diff of the 64 settings before applying' },
            { id: 'restart', t: 'button', label: 'Restart Frames', hint: 'Takes about 20 seconds. Signed-in people stay signed in.', meta: 'Restart', toast: 'Restarting…' } ] } ] },
      ],
    };
  }
  flash(msg) { this.setState({ toast: msg }); clearTimeout(this.tt); this.tt = setTimeout(() => this.setState({ toast: '' }), 1800); }
  set(id, v) { this.setState((s) => ({ vals: { ...s.vals, [id]: v } })); this.flash('Saved'); if (id === 'country') { try { localStorage.setItem('frames-country', v); } catch (e) {} window.dispatchEvent(new CustomEvent('frames-country', { detail: v })); }
    if (id === 'theme') window.dispatchEvent(new CustomEvent('frames-theme', { detail: v.toLowerCase() })); }
  renderVals() {
    const D = this.defs(); const S = this.state;
    const byId = {}; for (const t of ['lib', 'srv']) for (const s of D[t]) for (const g of s.groups) for (const r of g.rows) byId[r.id] = r;
    const get = (id) => (id in S.vals ? S.vals[id] : byId[id].def);
    const truthy = (v) => !!v && v !== 'Off';
    const visible = (r) => r.t !== 'hidden' && (!r.dep || (visible(byId[r.dep]) && (r.depVal ? get(r.dep) === r.depVal : truthy(get(r.dep)))));
    const mk = (r, i, len) => {
      const v = get(r.id); const t = r.t;
      const o = { label: r.label, hint: r.hint || '', hasHint: !!r.hint, note: r.note || '', hasNote: !!r.note, pl: r.dep ? '16px' : '0', bl: r.dep ? '2px solid rgba(255,255,255,.1)' : 'none', border: i < len - 1 ? '1px solid rgba(255,255,255,.08)' : 'none', labelFg: r.dim ? '#a8a59f' : '#efede8',
        hasThumbs: !!r.thumbs, thumbs: r.thumbs || [], hasIcon: !!r.icon, icon: r.icon || '', iconBg: r.dim ? 'transparent' : 'rgba(255,255,255,.08)', iconFg: r.dim ? '#6f6c67' : '#efede8',
        hasAvatar: !!r.avatar, avatarName: get('name'),
        isToggle: t === 'toggle' || t === 'selTog' || t === 'method' || t === 'order', isOrder: t === 'order', isInviteBox: t === 'inviteBox', isMethod: t === 'method', togOp: 1, togTitle: '', isStepper: t === 'stepper', isSelect: t === 'select' || t === 'selTog', isSeg: t === 'seg' || t === 'chips', isSeq: t === 'seq', isText: t === 'text', isLink: t === 'link', isButton: t === 'button', isSwatch: t === 'swatch', isPills: t === 'pills', isMeter: t === 'meter', selPrefix: r.prefix || '', selOp: 1 };
      if (r.dim) o.iconBg = 'transparent';
      if (r.id === 'pfHost') { const host = String(get('pfHost') || 'photography.example.com').replace(/^https?:\/\//, '').replace(/\/.*$/, ''); const app = String(get('appUrl') || 'https://frames.example.com').replace(/^https?:\/\//, '').replace(/\/.*$/, ''); o.hint = 'Shows only the portfolio. At your DNS provider, add a CNAME record for ' + host + ' pointing to ' + app + '.'; o.hasHint = true; }
      if (t === 'order') { const all = ['Local (Ollama)', ...((this.state && this.state.aiShared) || []).map((x) => x.name), 'Claude', ...((this.state && this.state.aiExtra) || []).map((x) => x.name)]; const cur = [...(v || []).filter((x) => all.includes(x) || String(x).startsWith('~')), ...all.filter((x) => !(v || []).includes(x) && !(v || []).includes('~' + x))]; const on = cur.filter((x) => !String(x).startsWith('~'));
        o.ord = cur.map((x, k) => { const skip = String(x).startsWith('~'); const name = skip ? x.slice(1) : x; const rank = skip ? '–' : String(on.indexOf(x) + 1); return { rank, name, fg: skip ? '#6f6c67' : '#efede8', bg: skip ? 'transparent' : 'rgba(255,255,255,.06)', ring: skip ? 'inset 0 0 0 1px rgba(255,255,255,.12)' : 'none', deco: skip ? 'line-through' : 'none', upShow: k > 0 ? 'inline-grid' : 'none', title: skip ? 'Skipped · click to use again' : 'Click to skip for this job',
          up: (e) => { e.stopPropagation(); const nx = [...cur]; [nx[k - 1], nx[k]] = [nx[k], nx[k - 1]]; this.set(r.id, nx); }, down: (e) => { e.stopPropagation(); if (k >= cur.length - 1) return; const nx = [...cur]; [nx[k + 1], nx[k]] = [nx[k], nx[k + 1]]; this.set(r.id, nx); }, downShow: k < cur.length - 1 ? 'inline-grid' : 'none', upFg: k > 0 ? '#a8a59f' : '#3a3936', downFg: k < cur.length - 1 ? '#a8a59f' : '#3a3936',
          dragStart: (e) => { e.dataTransfer.setData('text/plain', String(k)); }, dragOver: (e) => e.preventDefault(), drop: (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); if (isNaN(from) || from === k) return; const nx = [...cur]; const [x2] = nx.splice(from, 1); nx.splice(k, 0, x2); this.set(r.id, nx); },
          skipLabel: skip ? 'Use' : 'Skip', toggle: () => { if (!skip && on.length <= 1) { this.flash('Keep at least one provider, or switch the job off'); return; } const nx = [...cur]; nx[k] = skip ? name : '~' + name; this.set(r.id, nx); } }; });
        o.ordFirst = on[0] || '—'; o.ordMore = on.length > 1 ? 'then ' + (on.length - 1) + ' more' : ''; o.ordOp = get(r.tog) ? 1 : 0.4; o.openOrder = () => this.setState({ ordFor: r.id }); }
      if (t === 'inviteBox') { const QI = S.qi || { email: '', role: 'Member' }; const setQ = (p) => this.setState((st) => ({ qi: { ...(st.qi || { email: '', role: 'Member' }), ...p } })); const okE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(QI.email.trim()); const send = () => { if (!okE) return; this.setState((st) => ({ qi: { email: '', role: QI.role }, invites: [...(st.invites || []), { email: QI.email.trim(), role: QI.role }] })); this.flash('Invite sent to ' + QI.email.trim() + ' · added to the allowed list'); };
        Object.assign(o, { qiEmail: QI.email, qiOnEmail: (e) => setQ({ email: e.target.value }), qiKey: (e) => { if (e.key === 'Enter') send(); }, qiSend: send, qiOp: okE ? 1 : 0.4, qiRoles: ['Admin', 'Member', 'Guest only'].map((x) => ({ label: x, bg: QI.role === x ? '#efede8' : 'transparent', fg: QI.role === x ? '#0d0d0d' : '#a8a59f', pick: () => setQ({ role: x }) })), qiMore: () => this.setState({ inv: { email: QI.email, role: QI.role, note: '' } }) }); }
      if (t === 'toggle' || t === 'selTog' || t === 'order') { const tid = t === 'selTog' || t === 'order' ? r.tog : r.id; const tv = get(tid); Object.assign(o, { trackBg: tv ? '#efede8' : 'rgba(255,255,255,.14)', knobLeft: tv ? '21px' : '3px', knobBg: tv ? '#0d0d0d' : '#a8a59f', toggle: () => this.set(tid, !tv) }); if (t === 'selTog') o.selOp = tv ? 1 : 0.4; }
      if (t === 'method') {
        const ts = (S.tests || {})[r.id] || r.test || 'none'; const passed = ts === 'pass';
        Object.assign(o, { togOp: passed ? 1 : 0.35, togTitle: passed ? '' : 'Test it first',
          toggle: () => { if (!passed) { this.flash('Test ' + r.label + ' before turning it on'); return; } this.set(r.id, !v); },
          testLabel: ts === 'busy' ? 'Testing…' : ts === 'pass' ? '✓ Passed' : ts === 'fail' ? '✕ ' + r.failWith + ' · retry' : 'Test', testFg: ts === 'fail' ? 'oklch(0.75 0.14 28)' : ts === 'pass' ? '#a8a59f' : '#efede8',
          testSpin: ts === 'busy' ? React.createElement('i', { style: { width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block' } }) : null,
          runTest: () => { if (ts === 'busy') return; this.setState((st) => ({ tests: { ...(st.tests || {}), [r.id]: 'busy' } })); setTimeout(() => { this.setState((st) => ({ tests: { ...(st.tests || {}), [r.id]: r.failWith ? 'fail' : 'pass' } })); if (r.failWith) { if (v) this.set(r.id, false); } }, 1300); },
          cfgLabel: r.id === 'm_passkey' ? 'Built in' : r.failWith ? 'Configure' : '✓ Configured', cfgFg: r.failWith ? '#efede8' : '#8f8c86', cfgTitle: r.failWith ? '' : 'Click to change',
          configure: () => this.flash('Would open the ' + r.label + ' settings') });
      }
      if (t === 'stepper') { const st = r.step || 1; Object.assign(o, { display: v + (r.unit || ''), dec: () => this.set(r.id, Math.max(r.min, v - st)), inc: () => this.set(r.id, Math.min(r.max, v + st)) }); }
      if (t === 'select' || t === 'selTog') { const open = S.open === r.id; Object.assign(o, { display: v, isOpen: open, z: open ? 6 : 'auto', openMenu: () => this.setState({ open: open ? null : r.id }), opts: r.opts.map((x) => ({ label: x, check: x === v ? '✓' : '', bg: x === v ? 'rgba(255,255,255,.08)' : 'transparent', pick: () => { this.setState({ open: null }); this.set(r.id, x); } })) }); }
      if (t === 'seg') o.segs = r.opts.map((x) => ({ label: x, bg: x === v ? '#efede8' : 'transparent', fg: x === v ? '#0d0d0d' : '#a8a59f', pick: () => this.set(r.id, x) }));
      if (t === 'chips') o.segs = r.opts.map((x) => { const on = v.includes(x); return { label: (on ? '✓ ' : '') + x, bg: on ? 'rgba(255,255,255,.12)' : 'transparent', fg: on ? '#efede8' : '#8f8c86', pick: () => this.set(r.id, on ? v.filter((y) => y !== x) : [...v, x]) }; });
      if (t === 'seq') {
        const n = get('sessions'); const arr = v.slice(0, n);
        while (arr.length < n) { const last = r.opts.indexOf(arr[arr.length - 1]); arr.push(r.opts[Math.min(r.opts.length - 1, last + 1)]); }
        o.seq = arr.map((x, k) => ({ label: x, arrow: k < arr.length - 1 ? '→' : '', pick: () => { const nx = [...arr]; nx[k] = r.opts[(r.opts.indexOf(x) + 1) % r.opts.length]; this.set(r.id, nx); } }));
      }
      if (t === 'swatch') o.sw = r.opts.map(([name, c]) => ({ name, bg: c, ring: name === v ? '0 0 0 2px #161615,0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.12)', pick: () => this.set(r.id, name) }));
      if (t === 'pills') Object.assign(o, { pills: v.map((x) => ({ label: x, remove: () => this.set(r.id, v.filter((y) => y !== x)) })), addPill: () => { let n = r.addAs; let k = 2; while (v.includes(n)) n = r.addAs + ' ' + k++; this.set(r.id, [...v, n]); } });
      if (t === 'meter') Object.assign(o, { pct: r.pct + '%', meterText: r.text });
      if (t === 'text') Object.assign(o, { display: v, ph: r.ph || '', inputType: r.inputType || 'text', onText: (e) => this.set(r.id, e.target.value) });
      if (t === 'link' || t === 'button') Object.assign(o, { meta: r.meta, btnFg: r.danger ? 'oklch(0.75 0.14 28)' : '#efede8', act: () => (r.toast === 'envDiff' ? (this._get = get, this.setState({ diff: true, diffDone: '' })) : r.toast === 'env' ? this.openEnv(get) : r.toast === 'tunnelLog' ? this.setState({ tlog: 'tunnel' }) : r.toast === 'appLog' ? this.setState({ tlog: 'app' }) : r.toast === 'cfHelp' ? this.setState({ cfHelp: true }) : r.toast === 'cfStatus' ? this.setState({ cfStat: 'idle' }) : r.toast === 'goMembers' ? this.setState((st) => ({ tab: 'srv', q: '', sec: { ...st.sec, srv: 'people' } })) : r.toast === 'mailLog' ? this.setState({ mlog: { f: 'all' } }) : r.toast === 'mailTest' ? (this.setState((x) => ({ mailSent: [['Just now', 'trent@example.com', 'Test email from Frames', 'Delivered', 'Test'], ...(x.mailSent || [])] })), this.flash('Test email sent to trent@example.com · see the Email log')) : !r.toast ? null : r.toast === 'gear' ? (this.props.proto ? (location.hash = 'gear') : this.flash('Would open the Gear page')) : r.toast === 'profile' ? this.setState((st) => ({ tab: 'lib', q: '', sec: { ...st.sec, lib: 'profile' } })) : this.flash(r.toast)) });
      if (r.id === 'cloudFullRes' && !get('srvFullRes')) { o.togOp = 0.4; o.togTitle = 'Turned off by an admin'; o.note = 'Turned off by an admin for everyone on this server. Cloud photos are saved as 4096 px copies.'; o.hasNote = true; o.trackBg = 'rgba(255,255,255,.14)'; o.knobLeft = '3px'; o.knobBg = '#a8a59f'; o.toggle = () => this.flash('An admin has turned this off in Server → Photos & storage'); }
      return o;
    };
    const tab = S.tab; const q = S.q.trim().toLowerCase();
    const secs = D[tab]; const cur = secs.find((s) => s.key === S.sec[tab]) || secs[0];
    let groups = []; let title = cur.name; let subtitle = cur.hint;
    if (q) {
      let count = 0;
      for (const t of ['lib', 'srv']) for (const s of D[t]) {
        const rows = []; for (const g of s.groups) for (const r of g.rows) if (visible(r) && (r.label + ' ' + (r.hint || '') + ' ' + s.name + ' ' + (g.title || '')).toLowerCase().includes(q)) rows.push(r);
        if (rows.length) { count += rows.length; groups.push({ title: s.name + (t === 'srv' ? ' · Server' : ''), hasTitle: true, hasJump: true, jump: () => this.setState((st) => ({ q: '', tab: t, sec: { ...st.sec, [t]: s.key } })), rows: rows.map((r, i) => mk(r, i, rows.length)) }); }
      }
      title = 'Results for “' + S.q.trim() + '”'; subtitle = count + (count === 1 ? ' setting' : ' settings') + ' across both tabs';
    } else {
      groups = cur.groups.map((g) => { const rows = g.rows.filter(visible); return { title: g.title, hasTitle: !!g.title, hasJump: false, jump: null, rows: rows.map((r, i) => mk(r, i, rows.length)) }; }).filter((g) => g.rows.length);
    }
    const nav = secs.map((s) => { const on = !q && s.key === cur.key; return { label: s.name, badge: s.badge || '', bg: on ? 'rgba(255,255,255,.08)' : 'transparent', fg: on ? '#efede8' : '#a8a59f', go: () => this.setState((st) => ({ q: '', open: null, sec: { ...st.sec, [tab]: s.key } })) }; });
    const act = !q && cur.action;
    return {
      groups, title, subtitle, nav, q: S.q, hasQ: !!S.q, noResults: !!q && groups.length === 0,
      hasAction: !!act, actionLabel: act ? act.label : '', actionGo: () => { if (!act) return; if (act.modal === 'ai' || act.modal === 'aiShared') { this.setState({ aiAdd: { brand: null, key: '', addr: '', model: '', test: 'idle', shared: act.modal === 'aiShared' } }); return; } if (act.modal) { this.setState({ inv: { email: '', role: 'Member', note: '' } }); return; } if (act.to && this.props.proto) location.hash = act.to; else this.flash(act.toast); },
      onQ: (e) => this.setState({ q: e.target.value, open: null }), clearQ: () => this.setState({ q: '' }),
      isSrv: tab === 'srv' && !q,
      toLib: () => this.setState({ tab: 'lib', q: '', open: null }), toSrv: () => this.setState({ tab: 'srv', q: '', open: null }),
      libBg: tab === 'lib' ? 'rgba(255,255,255,.1)' : 'transparent', libFg: tab === 'lib' ? '#efede8' : '#a8a59f',
      srvBg: tab === 'srv' ? 'rgba(255,255,255,.1)' : 'transparent', srvFg: tab === 'srv' ? '#efede8' : '#a8a59f',
      anyOpen: !!S.open || !!S.prof, closeMenus: () => this.setState({ open: null, prof: false }),
      profOpen: !!S.prof, profCaret: S.prof ? '▴' : '▾', profBg: S.prof ? 'rgba(255,255,255,.08)' : 'transparent', profFg: S.prof ? '#efede8' : '#a8a59f',
      toggleProf: () => this.setState({ prof: !S.prof, open: null }),
      displayName: get('name'), email: get('email'),
      profItems: [
        { label: 'Settings', meta: '⌘ ,', sep: 'none', fg: '#efede8', bg: 'rgba(255,255,255,.08)', go: () => this.setState({ prof: false, tab: 'lib', q: '', sec: { ...S.sec, lib: 'profile' } }) },
        { label: 'Your stats', meta: '48,210 photos', sep: 'none', fg: '#efede8', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would open Your stats'); } },
        { label: 'To do', meta: '1,284', sep: 'none', fg: '#efede8', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would open the To do list'); } },
        { label: 'What’s new', meta: 'v1.14.0 ●', sep: 'block', fg: '#efede8', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would open release notes'); } },
        { label: 'Welcome tour', meta: '', sep: 'none', fg: '#efede8', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would start the tour'); } },
        { label: 'Help & docs', meta: '↗', sep: 'none', fg: '#efede8', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would open the wiki'); } },
        { label: 'Sign out', meta: '', sep: 'block', fg: '#a8a59f', bg: 'transparent', go: () => { this.setState({ prof: false }); this.flash('Would sign you out'); } },
      ],
      toast: S.toast || 'Saved', toastOp: S.toast ? 1 : 0,
      ...(() => {
        const I = S.inv || { email: '', role: 'Member', note: '' }; const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(I.email.trim()); const typed = I.email.trim().length > 0;
        const setI = (p) => this.setState((st) => ({ inv: { ...(st.inv || I), ...p } }));
        const RO = [['Admin', 'Everything, including these server settings.'], ['Member', 'Their own library, shoots and compositions.'], ['Guest only', 'Only sees compositions shared with them. Can rate and suggest.']];
        return {
          ...(() => { const A = S.aiAdd; if (!A) return { aiOpen: false }; const setA = (p) => this.setState((st) => ({ aiAdd: { ...st.aiAdd, ...p } }));
            const have = A.shared ? ['Local (Ollama)', ...(S.aiShared || []).map((x) => x.name)] : ['Claude', 'Local (Ollama)', ...(S.aiShared || []).map((x) => x.name), ...(S.aiExtra || []).map((x) => x.name)];
            const B = [['claude', 'CL', 'Claude', 'Anthropic · best at descriptions', 'key', 'claude-sonnet'], ['openai', 'OA', 'OpenAI', 'GPT models with vision', 'key', 'gpt-4.1-mini'], ['gemini', 'GE', 'Google Gemini', 'Cheap, fast, good at tags', 'key', 'gemini-2.5-flash'], ['ollama', 'OL', 'Local (Ollama)', 'Runs on your hardware · free', 'addr', 'llava'], ['mistral', 'MI', 'Mistral', 'EU-hosted option', 'key', 'pixtral-large'], ['other', '+', 'Other', 'Any OpenAI-compatible address: LM Studio, OpenRouter…', 'both', '']];
            const b = B.find((x) => x[0] === A.brand); const needKey = b && (b[4] === 'key' || b[4] === 'both'); const needAddr = b && (b[4] === 'addr' || b[4] === 'both');
            const ok = b && (!needKey || A.key.trim().length > 6) && (!needAddr || A.addr.trim().length > 4); const tst = A.test;
            return { aiOpen: true, closeAi: () => this.setState({ aiAdd: null }), aiPicking: !b, aiForm: !!b, aiTitle: b ? (A.shared ? 'Share ' : 'Connect ') + b[2] : A.shared ? 'Add shared AI' : 'Add an AI provider', aiSub: b ? b[3] + (have.some((h) => h === b[2] || h.startsWith(b[2] + ' · ')) ? ' · you can reuse the same key with a different model' : '') : A.shared ? 'Everyone on this server can use it. Paid usage counts toward the per-person limit.' : 'Pick the provider. Add as many as you like, including the same one with different models, then set the order each job uses them in.',
              aiBrands: B.map(([k, icon, name, note]) => { const n = have.filter((h) => h === name || h.startsWith(name + ' · ')).length; return { icon, name, note: n ? n + ' connected · add another model' : note, op: 1, cursor: 'pointer', pick: () => { setA({ brand: k, test: 'idle' }); } }; }),
              aiNeedsKey: !!needKey, aiNeedsAddr: !!needAddr, aiKey: A.key, onAiKey: (e) => setA({ key: e.target.value, test: 'idle' }), aiAddr: A.addr, onAiAddr: (e) => setA({ addr: e.target.value, test: 'idle' }), aiModel: A.model, onAiModel: (e) => setA({ model: e.target.value }),
              aiKeyPh: 'Paste your key', aiAddrPh: b && b[0] === 'ollama' ? 'http://192.168.1.20:11434' : 'https://openrouter.ai/api/v1', aiModelPh: b ? (b[5] || 'model name') : '', aiKeyHelp: A.shared ? 'Stored encrypted. Members can use it but never see the key.' : 'Stored encrypted on this server. Only used for the jobs you assign.',
              aiSpin: tst === 'busy' ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
              aiTestMsg: tst === 'busy' ? 'Sending a test photo…' : tst === 'pass' ? '✓ Connected · described the test photo in 1.8 s' : '', aiTestFg: tst === 'pass' ? 'oklch(0.78 0.12 150)' : '#a8a59f',
              aiBack: () => setA({ brand: null }), aiBackVis: b ? 'visible' : 'hidden', aiFormFlex: b ? 'inline-flex' : 'none', aiOkOp: ok ? 1 : 0.4, aiSaveLabel: A.shared ? 'Share with everyone' : 'Add provider', aiSaveOp: ok ? 1 : 0.4,
              aiTest: () => { if (!ok) return; setA({ test: 'busy' }); clearTimeout(this.aiTT); this.aiTT = setTimeout(() => this.setState((st) => (st.aiAdd ? { aiAdd: { ...st.aiAdd, test: 'pass' } } : null)), 1300); },
              aiSave: () => { if (!ok) return; const model = A.model.trim() || b[5] || 'default'; const base = b[0] === 'other' ? ((A.addr.replace(/^https?:\/\//, '').split(/[/:]/)[0]) || 'Custom AI') : b[2]; const same = have.some((h) => h === base || h.startsWith(base + ' · ')); let name = same ? base + ' · ' + model : base; if (have.includes(name)) { this.flash(base + ' with ' + model + ' is already connected'); return; } const detail = (A.model.trim() || b[5] || 'default model') + (needKey ? ' · key ••' + A.key.trim().slice(-4) : '') + (needAddr ? ' · ' + A.addr.replace(/^https?:\/\//, '') : ''); if (A.shared) { this.setState((st) => ({ aiAdd: null, aiShared: [...(st.aiShared || []), { name, icon: b[1], detail }] })); this.flash(name + ' shared with everyone on this server'); return; } this.setState((st) => ({ aiAdd: null, aiExtra: [...(st.aiExtra || []), { name, icon: b[1], detail }] })); this.flash(name + ' added · it’s last in each job’s order'); } }; })(),
          tlogOpen: !!S.tlog, closeTlog: () => this.setState({ tlog: false }), copyTlog: () => this.flash('Log copied'), tlogDl: S.tlog === 'app', dlTlog: () => this.flash('Downloading frames-logs.zip'),
          tlogTitle: S.tlog === 'app' ? 'Logs' : 'Tunnel log', tlogSub: S.tlog === 'app' ? 'Frames · level: ' + get('logLevel') + ' · newest last' : 'cloudflared · Connected · 2 connections · refreshes every 3 seconds',
          tlogLines: S.tlog === 'app' ? [['09:00:01', 'INF', 'Frames v1.17.0 started · library /mnt/photos'], ['09:00:02', 'INF', 'Database ready · 48,210 photos'], ['09:00:03', 'INF', 'Watching /mnt/photos for new files'], ['09:14:22', 'INF', 'Imported 36 photos into “Bondi, early”'], ['11:02:47', 'WRN', 'Slow RAW decode: DSC_4471.NEF took 9.2s'], ['12:30:05', 'INF', 'Guest link k7Qm2x opened by mia@example.com'], ['13:41:10', 'ERR', 'Email to sam@example.com failed: 550 mailbox unavailable'], ['14:02:14', 'INF', 'Tunnel connected · 2 connections'], ['15:20:00', 'INF', 'Backup saved to Google Drive · 41 MB']].map(([t, lv, m]) => ({ text: t + ' ' + lv + ' ' + m, fg: lv === 'WRN' ? 'oklch(0.8 0.12 80)' : lv === 'ERR' ? 'oklch(0.75 0.14 28)' : '#a8a59f' })) : [['14:02:11', 'INF', 'Starting tunnel tunnelID=4e9b…c21a'], ['14:02:11', 'INF', 'Version 2026.7.3'], ['14:02:12', 'INF', 'Generated Connector ID: 9a1f…'], ['14:02:12', 'INF', 'Initial protocol quic'], ['14:02:13', 'INF', 'Registered tunnel connection connIndex=0 location=syd01 protocol=quic'], ['14:02:13', 'INF', 'Registered tunnel connection connIndex=1 location=mel01 protocol=quic'], ['14:02:14', 'INF', 'Updated to new configuration: 3 hostnames (frames.trent.au, photography.trent.au, mia.photos)'], ['16:40:02', 'WRN', 'Connection terminated connIndex=1 error="timeout: no recent network activity"'], ['16:40:04', 'INF', 'Retrying connection in up to 2s connIndex=1'], ['16:40:06', 'INF', 'Registered tunnel connection connIndex=1 location=mel01 protocol=quic']].map(([t, lv, m]) => ({ text: t + ' ' + lv + ' ' + m, fg: lv === 'WRN' ? 'oklch(0.8 0.12 80)' : lv === 'ERR' ? 'oklch(0.75 0.14 28)' : '#a8a59f' })),
          ...(() => { const st = S.cfStat; if (!st) return { cfStatOpen: false }; const busy = st === 'busy'; const when = st === 'done' ? 'just now' : '9 Nov 2026, 14:02';
            const allow = 'your Members (trent@, mia@, sam@example.com)'; const app = String(get('appUrl') || '').replace(/^https?:\/\//, '') || 'frames.example.com'; const inv = get('cfWho') === 'Members'; const pf = get('tunnelPf');
            const mk = (rows) => rows.map(([a, b, ok], k) => ({ a, b, ok: busy ? 'checking…' : ok || 'in place', okFg: busy ? '#8f8c86' : 'oklch(0.78 0.12 150)', border: k < rows.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }));
            const hosts = [[app, 'the app'], ...(pf ? [['photography.trent.au', 'portfolio: Trent'], ['mia.photos', 'portfolio: Mia']] : [])];
            return { cfStatOpen: true, closeCfStat: () => this.setState({ cfStat: null }),
              cfStatMsg: busy ? 'Checking Cloudflare and applying changes…' : 'Everything matches · applied ' + when, cfStatFg: busy ? '#a8a59f' : 'oklch(0.78 0.12 150)', cfStatDot: 'oklch(0.78 0.12 150)', cfStatDotShow: busy ? 'none' : 'inline-block',
              cfStatSpin: busy ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
              cfSections: [
                { title: 'Tunnel', rows: mk([['Frames', 'ID 4e9b7d20-…-c21a · run by Frames (cloudflared 2026.7.3) · 2 connections: SYD, MEL', 'connected']]) },
                { title: 'Routes', rows: mk(hosts.map(([h, w]) => [h, (w === 'the app' ? 'http://127.0.0.1:3000' : 'http://127.0.0.1:3000 · ' + w + ', only the public portfolio')])) },
                { title: 'DNS records', rows: mk(hosts.map(([h]) => [h, 'CNAME → 4e9b7d20-…-c21a.cfargotunnel.com · proxied'])) },
                { title: 'Access applications', rows: mk([...(inv ? [['Frames · login required', app + ' · policy: allow ' + allow]] : [['Frames · open', app + ' · policy: bypass (everyone) · Frames’ own sign-in still applies']]), ['Frames public · no login', app + '/s/*  ' + app + '/portfolio/*' + (pf ? '  photography.trent.au  mia.photos' : '') + ' · policy: bypass']]) },
              ],
              cfReapplyOp: busy ? 0.4 : 1, cfReapply: () => { if (busy) return; this.setState({ cfStat: 'busy' }); clearTimeout(this.cfT); this.cfT = setTimeout(() => this.setState((x) => (x.cfStat ? { cfStat: 'done' } : null)), 1600); } }; })(),
          ...(() => { const M = S.mlog; if (!M) return { mlogOpen: false };
            const BASE = [['Today 14:20', 'mia@example.com', 'Trent shared “Kitchen wall” with you', 'Delivered', 'Share'], ['Today 09:02', 'sam@example.com', 'You’re invited to Trent’s Frames', 'Failed', 'Invite', '550 5.1.1 Mailbox unavailable'], ['Yesterday 21:44', 'trent@example.com', 'Mia suggested 2 changes to Kitchen wall', 'Delivered', 'Notification'], ['Yesterday 18:10', 'jo@family.com', 'Trent shared “Rottnest, March” with you', 'Delivered', 'Share'], ['7 Nov', 'trent@example.com', 'Frames v1.17.0 is ready', 'Delivered', 'Update'], ['6 Nov', 'mia@example.com', 'Sign in to Frames', 'Delivered', 'Sign-in'], ['4 Nov', 'trent@example.com', 'Weekly backup finished · 41 MB', 'Delivered', 'Backup'], ['2 Nov', 'ben@example.com', 'You’re invited to Trent’s Frames', 'Bounced', 'Invite', 'Recipient address rejected']];
            const all = [...(S.mailSent || []), ...BASE]; const bad = (r) => r[3] !== 'Delivered'; const rows = all.filter((r) => M.f === 'all' || (M.f === 'failed' ? bad(r) : !bad(r)));
            const nf = all.filter(bad).length; const setM = (p) => this.setState((x) => ({ mlog: { ...x.mlog, ...p } }));
            return { mlogOpen: true, closeMlog: () => this.setState({ mlog: null }), mlogSub: 'From ' + get('mailFrom') + ' via ' + get('smtpHost') + ' · ' + all.length + ' in the last 30 days',
              mlogTabs: [['all', 'All · ' + all.length], ['ok', 'Delivered · ' + (all.length - nf)], ['failed', 'Failed · ' + nf]].map(([k, label]) => ({ label, bg: M.f === k ? '#efede8' : 'transparent', fg: M.f === k ? '#0d0d0d' : '#a8a59f', go: () => setM({ f: k }) })),
              mlogRows: rows.map(([when, to, subj, status, type, err]) => ({ when, to, subj, type, status, err: err || '', fg: status === 'Delivered' ? 'oklch(0.78 0.12 150)' : 'oklch(0.75 0.14 28)' })), mlogEmpty: rows.length === 0,
              mlogHasFail: nf > 0, mlogFailNote: nf ? nf + (nf === 1 ? ' email' : ' emails') + ' didn’t arrive. Hover the subject to see why; check the address, or copy an invite link instead.' : '',
              mlogRetryOp: nf ? 1 : 0.35, mlogRetryLabel: nf ? 'Retry failed (' + nf + ')' : 'No failed emails',
              mlogRetry: () => { if (nf) this.flash('Retrying ' + nf + ' failed ' + (nf === 1 ? 'email' : 'emails')); }, mlogDl: () => this.flash('Downloaded frames-email-log.csv') }; })(),
          cfHelpOpen: !!S.cfHelp, closeCfHelp: () => this.setState({ cfHelp: false }),
          cfPerms: [['Account', 'Cloudflare Tunnel', 'Edit', 'Always'], ['Zone', 'DNS', 'Edit', 'Always'], ['Account', 'Access: Apps and Policies', 'Edit', 'For Cloudflare Access (Invitation only, and the public share links)'], ['Account', 'Access: Organizations, Identity Providers, and Groups', 'Read', 'For Cloudflare Access sign-in (finds your team domain)']].map(([scope, what, level, why]) => ({ scope, what, level, why })),
          ...(() => { const E = S.env; if (!E) return { envOpen: false }; const setE = (p) => this.setState((st) => ({ env: { ...st.env, ...p } }));
            const lines = E.text.split('\n'); const bad = lines.map((l, k) => [l.trim(), k + 1]).filter(([l]) => l && !l.startsWith('#') && !/^[A-Z][A-Z0-9_]*=/.test(l));
            const changed = E.text !== E.orig; const nChanged = (() => { const kv = (t) => Object.fromEntries(t.split('\n').filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l.trim())).map((l) => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1)])); const a = kv(E.orig), b = kv(E.text); return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).length; })();
            return { envOpen: true, envText: E.text, onEnv: (e) => setE({ text: e.target.value, saved: false }), closeEnv: () => this.setState({ env: null }),
              envMsg: E.restarting ? 'Restarting Frames… back in about 20 seconds' : bad.length ? 'Line ' + bad[0][1] + ' isn’t NAME=value. Fix it before saving.' : E.saved ? '✓ Saved · restart Frames to apply' : changed ? nChanged + (nChanged === 1 ? ' setting changed' : ' settings changed') + ' · not saved yet' : 'Matches the settings on these pages.',
              envMsgFg: bad.length ? 'oklch(0.75 0.14 28)' : E.saved ? 'oklch(0.78 0.12 150)' : '#8f8c86',
              envSpin: E.restarting ? React.createElement('i', { style: { width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,.2)', borderTopColor: '#efede8', animation: 'spin .8s linear infinite', display: 'inline-block', flex: 'none' } }) : null,
              envRevertOp: changed && !E.saved ? 1 : 0.35, envRevert: () => setE({ text: E.orig, saved: false }),
              envDownload: () => this.flash('Downloaded frames.env'),
              envSaveOp: (changed || E.saved) && !bad.length && !E.restarting ? 1 : 0.4, envSaveLabel: E.saved ? 'Restart now' : 'Save',
              envSave: () => { if (bad.length || E.restarting) return; if (E.saved) { setE({ restarting: true }); clearTimeout(this.envT); this.envT = setTimeout(() => { this.setState({ env: null }); this.flash('Frames restarted · new settings applied'); }, 1800); return; } if (!changed) return; setE({ saved: true, orig: E.text }); } }; })(),
          ...(() => { if (!S.ordFor || !byId[S.ordFor]) return { ordOpen: false }; const row = mk(byId[S.ordFor], 0, 1); return { ordOpen: true, ordTitle: byId[S.ordFor].label, ordList: row.ord || [], closeOrd: () => this.setState({ ordFor: null }) }; })(),
          ...(() => { const rows = S.diffDone ? [] : [['Mail server', 'SMTP_HOST', 'smtp.fastmail.com', 'smtp.gmail.com'], ['Processing workers', 'FRAMES_WORKERS', '6', '4'], ['Update channel', 'FRAMES_UPDATE_CHANNEL', 'beta', 'stable']];
            return { diffOpen: !!S.diff, closeDiff: () => this.setState({ diff: false }), diffTitle: rows.length ? rows.length + ' settings differ' : 'In sync',
              diffRows: rows.map(([label, key, app, file]) => ({ label, key, app, file })), diffHasMsg: !!S.diffDone, diffMsg: S.diffDone, diffBtnOp: rows.length ? 1 : 0.4,
              diffExport: () => rows.length && this.setState({ diffDone: '✓ Wrote the app’s values to /config/frames.env. The app and file now match.' }),
              diffUseFile: () => rows.length && this.setState({ diffDone: '✓ Loaded the file’s values. Frames restarts in about 20 seconds.' }),
              diffEdit: () => { this.setState({ diff: false }); if (this._get) this.openEnv(this._get); } }; })(),
          invOpen: !!S.inv, closeInv: () => this.setState({ inv: null, invCopied: false }), stopInv: (e) => e.stopPropagation(),
          invEmail: I.email, onInvEmail: (e) => setI({ email: e.target.value }), invNote: I.note, onInvNote: (e) => setI({ note: e.target.value }),
          invRing: typed && !ok ? 'oklch(0.62 0.17 28)' : 'rgba(255,255,255,.2)', invMsg: typed && !ok ? 'That doesn’t look like an email address.' : 'Sign-in with: Passkey, Cloudflare Access', invMsgFg: typed && !ok ? 'oklch(0.75 0.14 28)' : '#6f6c67',
          invRoles: RO.map(([label, hint]) => { const on = I.role === label; return { label, hint, bg: on ? 'rgba(255,255,255,.06)' : 'transparent', ring: on ? 'inset 0 0 0 1px rgba(255,255,255,.16)' : 'none', dot: on ? 'inset 0 0 0 5px #efede8' : 'inset 0 0 0 1.5px rgba(255,255,255,.35)', pick: () => setI({ role: label }) }; }),
          invSendOp: ok ? 1 : 0.4, invCopyLabel: S.invCopied ? 'Link copied ✓ · works for 7 days' : 'Copy an invite link instead',
          copyInv: () => this.setState({ invCopied: true }),
          sendInv: () => { if (!ok) return; this.setState((st) => ({ inv: null, invCopied: false, invites: [...(st.invites || []), { email: I.email.trim(), role: I.role }] })); this.flash('Invite sent to ' + I.email.trim()); },
        };
      })(),
    };
  }
}
