import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, useKey } from './components/bits';
import { Changelog } from './components/Changelog';
import { Search } from './components/Search';
import { NewComposition } from './components/NewComposition';
import { UiContext, type NewCompositionStart } from './ui';
import { Todo } from './pages/Todo';
import { Today } from './pages/Today';
import { Library } from './pages/Library';
import { PhotoDetail } from './pages/PhotoDetail';
import { Review } from './pages/Review';
import { Shoots } from './pages/Shoots';
import { Collections, CollectionDetail } from './pages/Collections';
import { ForYou } from './pages/ForYou';
import { Stats } from './pages/Stats';
import { SettingsPage } from './pages/Settings';
import { ShootDetail } from './pages/ShootDetail';
import { Compare } from './pages/Compare';
import { Duplicates } from './pages/Duplicates';
import { SharePage } from './pages/SharePage';
import { Welcome } from './pages/Welcome';
import { GuestHome } from './pages/GuestHome';
import { api } from './api';
import { useStore } from './store';

function Shell() {
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<NewCompositionStart | null>(null);
  const { refreshSummary, summary } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const inReview = loc.pathname === '/review';
  // Someone new, with an empty library, is shown the welcome tour once, when they arrive at the front page.
  useEffect(() => {
    if (loc.pathname !== '/') return;
    api<{ done: boolean }>('/welcome').then((w) => { if (!w.done) nav('/welcome', { replace: true }); }).catch(() => undefined);
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching((s) => !s);
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  useKey((e) => {
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !inReview && !searching) nav(summary && summary.due === 0 && !summary.resumable && summary.early > 0 ? '/review?early' : '/review'); // nothing due: begin anyway
  }, [inReview, searching, summary]);
  useEffect(() => { refreshSummary(); }, [loc.pathname, refreshSummary]);

  return (
    <UiContext.Provider value={{ openSearch: () => setSearching(true), openNew: (s) => { setSearching(false); setCreating(s ?? {}); } }}>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/library" element={<Library />} />
        <Route path="/photo/:id" element={<PhotoDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/shoots" element={<Shoots />} />
        <Route path="/shoots/:id" element={<ShootDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/duplicates" element={<Duplicates />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<CollectionDetail />} />
        <Route path="/for-you" element={<ForYou />} />
        <Route path="/todo" element={<Todo />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<Navigate to={`/settings?section=access${window.location.search.replace(/^\?/, '&')}`} replace />} />
        <Route path="*" element={<Today />} />
      </Routes>
      {!inReview && <BottomNav onSearch={() => setSearching(true)} onNew={() => setCreating({})} />}
      {!inReview && <Changelog />}
      {searching && <Search onClose={() => setSearching(false)} />}
      {creating && <NewComposition start={creating} onClose={() => setCreating(null)} />}
    </UiContext.Provider>
  );
}

/**
 * A share link opens a page of its own. It must not start the signed-in app (which would call the
 * login-protected API and, in a browser, pop up a password box for someone who has no password).
 */
export function App() {
  const loc = useLocation();
  const { me } = useStore();
  if (loc.pathname.startsWith('/s/')) return <Routes><Route path="/s/:token" element={<SharePage />} /><Route path="*" element={<SharePage />} /></Routes>;
  if (me?.role === 'guest') return <GuestHome />; // a guest has no library, so none of the app
  return <Shell />;
}
