import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useKey } from './components/bits';
import { BottomNav, EnvBanner, ShellModals, TabBar } from './components/Shell';
import { Search } from './components/Search';
import { NewComposition } from './components/NewComposition';
import { UiContext, type NewCompositionStart } from './ui';
import { Todo } from './pages/Todo';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { GoContext } from './proto/runtime';
import { PhotoDetail } from './pages/PhotoDetail';
import { Review } from './pages/Review';
import { Shoots } from './pages/Shoots';
import { Collections, CollectionDetail } from './pages/Collections';
import { Stats } from './pages/Stats';
import { SettingsPage } from './settings/SettingsPage';
import { ShootDetail } from './pages/ShootDetail';
import { Compare } from './pages/Compare';
import { Duplicates } from './pages/Duplicates';
import { SharePage } from './pages/SharePage';
import { Welcome } from './pages/Welcome';
import { Community } from './pages/Community';
import { Gear } from './pages/Gear';
import { GuestHome } from './pages/GuestHome';
import { api } from './api';
import { AUTH_PATHS, AuthApp } from './pages/Auth';
import { useStore } from './store';

const PAGE_NAMES: Record<string, string> = {
  '/': 'Today', '/library': 'Library', '/review': 'Review', '/shoots': 'Photoshoots', '/compare': 'Compare', '/duplicates': 'Duplicates',
  '/collections': 'Compositions', '/community': 'Community review', '/gear': 'Gear & wishlist', '/todo': 'To do', '/stats': 'Stats', '/welcome': 'Welcome', '/settings': 'Settings',
};
/** Pages that name themselves (a composition, a photoshoot, a photograph) are left alone. */
const NAMES_ITSELF = /^\/(photo|shoots|collections)\/[^/]+/;

function Shell() {
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<NewCompositionStart | null>(null);
  const { refreshSummary, summary } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const inReview = loc.pathname === '/review';
  useEffect(() => { if (!NAMES_ITSELF.test(loc.pathname)) document.title = PAGE_NAMES[loc.pathname.replace(/\/$/, '') || '/'] ? `${PAGE_NAMES[loc.pathname.replace(/\/$/, '') || '/']} · Frames` : 'Frames'; }, [loc.pathname]);
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
    <GoContext.Provider value={(to) => {
      const map: Record<string, string> = { home: '/', shoots: '/shoots', library: '/library', compositions: '/collections', review: '/review', community: '/community', settings: '/settings', gear: '/gear', stats: '/stats', todo: '/todo', welcome: '/welcome', dupes: '/duplicates', compare: '/compare', portfolio: '/portfolio/', editor: '/collections' };
      if (to === 'search') setSearching(true); else if (map[to]) nav(map[to]);
    }}>
    <UiContext.Provider value={{ openSearch: () => setSearching(true), openNew: (s) => { setSearching(false); setCreating(s ?? {}); } }}>
      {!inReview && <EnvBanner />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/photo/:id" element={<PhotoDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/shoots" element={<Shoots />} />
        <Route path="/shoots/:id" element={<ShootDetail />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/duplicates" element={<Duplicates />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collections/:id" element={<CollectionDetail />} />
        <Route path="/community" element={<Community />} />
        <Route path="/gear" element={<Gear />} />
        <Route path="/todo" element={<Todo />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<Navigate to={`/settings?section=access${window.location.search.replace(/^\?/, '&')}`} replace />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!inReview && loc.pathname !== '/welcome' && <BottomNav />}
      {!inReview && <TabBar />}
      <ShellModals />
      {searching && <Search onClose={() => setSearching(false)} />}
      {creating && <NewComposition start={creating} onClose={() => setCreating(null)} />}
    </UiContext.Provider>
    </GoContext.Provider>
  );
}

/**
 * A share link opens a page of its own. It must not start the signed-in app (which would call the
 * login-protected API and, in a browser, pop up a password box for someone who has no password).
 */
export function App() {
  const loc = useLocation();
  const { me } = useStore();
  if (AUTH_PATHS.test(loc.pathname)) return <AuthApp />;
  if (loc.pathname.startsWith('/s/')) return <Routes><Route path="/s/:token" element={<SharePage />} /><Route path="*" element={<SharePage />} /></Routes>;
  if (me?.role === 'guest') return <GuestHome />; // a guest has no library, so none of the app
  return <Shell />;
}
