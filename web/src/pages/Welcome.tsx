import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Mark } from '../components/bits';
import { useStore } from '../store';

/** A short tour for someone new: bringing photographs in, photoshoots and compositions, how reviewing works, and sharing for others to review. */
export function Welcome() {
  const nav = useNavigate();
  const { me } = useStore();
  const [i, setI] = useState(0);
  // Shown once: it counts as seen as soon as it opens, so following one of its links never brings it back or leaves it half-done.
  useEffect(() => { void api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); }, []);
  const finish = async () => { await api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); nav('/', { replace: true }); };
  const folder = me?.user?.folder;
  const steps: { title: string; body: ReactNode; actions?: ReactNode }[] = [
    {
      title: 'Bring your photographs in',
      body: (
        <>
          <p>Frames is not designed to hold your whole library, just the photographs you may want to print. Bring in the ones worth keeping an eye on.</p>
          <p>There are two ways. Either way, Frames only reads your originals: it never changes or deletes them.</p>
          <p><b>From cloud storage.</b> Connect Google Drive, Dropbox or OneDrive (as many accounts as you like), choose a folder, and Frames copies the photographs from it, and keeps checking for new ones.</p>
          <p><b>From files you have.</b> Upload them on the Photoshoots page{folder ? <>, or put them in your library folder on the server, <span className="mono">{folder}</span>, and press Sync</> : ''}.</p>
        </>
      ),
      actions: (
        <>
          <Link to="/settings?section=cloud-sync" className="pill">Connect cloud storage</Link>
          <Link to="/shoots" className="pill">Upload photographs</Link>
        </>
      ),
    },
    {
      title: 'Photoshoots and compositions',
      body: (
        <>
          <p>A <b>photoshoot</b> is a day of photographs, or a roll of film. Each time photographs come in, they are gathered into one, with its date, so you can find a day again.</p>
          <p>A <b>composition</b> is the idea or the artwork: the best photographs from a shoot, or from many, picked to belong together. Your “top 3 beaches” is a composition. A composition can have a print size, so Frames tells you whether each photograph has enough pixels, and you can download the originals of the ones you chose.</p>
        </>
      ),
      actions: <Link to="/collections" className="pill">See compositions</Link>,
    },
    {
      title: 'How reviewing works',
      body: (
        <>
          <p>You rate each photograph from 1 to 5, in a few short sessions spread over weeks (by default four, a week apart). You never see your earlier ratings while you rate, so the opinion that settles is really yours, not what you remember saying before.</p>
          <p>Reviewing is what feeds compositions. The photographs that keep scoring well rise to the top, so building a composition is picking from your strongest, and Frames suggests photographs that belong with the ones you chose.</p>
          <p>When nothing is due you can still begin: it shows the photographs you have not seen for longest.</p>
        </>
      ),
      actions: <Link to="/review" className="pill">Try a review</Link>,
    },
    {
      title: 'Share a composition for others to review',
      body: (
        <>
          <p>Open a composition and press <b>Share</b> to make a link. Anyone with the link can look through the composition without signing in. You choose whether they can download the originals and whether they can rate the photographs.</p>
          <p>Their ratings are kept apart from yours and never change your own reviews. A link can expire or be turned off at any time.</p>
        </>
      ),
      actions: <Link to="/collections" className="pill">Go to compositions</Link>,
    },
  ];
  const s = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="page">
      <div className="lockup" style={{ marginBottom: 8 }}><Mark />Frames</div>
      <div style={{ maxWidth: 640, marginTop: 24 }}>
        <div className="faint" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Welcome to Frames · {i + 1} of {steps.length}</div>
        <h1 className="serif" style={{ fontSize: 52, lineHeight: 1.05, margin: '10px 0 18px' }}>{s.title}</h1>
        <div className="t2" style={{ fontSize: 14.5, lineHeight: 1.6 }}>{s.body}</div>
        <div style={{ display: 'flex', gap: 8, margin: '26px 0 18px' }} role="tablist" aria-label="Steps">
          {steps.map((_, k) => <button key={k} role="tab" aria-selected={k === i} aria-label={`Step ${k + 1}`} onClick={() => setI(k)} style={{ width: 8, height: 8, borderRadius: '50%', background: k === i ? 'var(--text)' : 'var(--outline)' }} />)}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {i > 0 ? <button className="pill" onClick={() => setI(i - 1)}>Back</button> : <button className="pill" onClick={finish}>Skip</button>}
          {last ? <button className="pill primary" onClick={finish}>Start using Frames</button> : <button className="pill primary" onClick={() => setI(i + 1)}>Next</button>}
        </div>
      </div>
    </div>
  );
}
