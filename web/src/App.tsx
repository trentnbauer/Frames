import { WishlistHistory } from './screens/WishlistHistory';
import { ReviewSchedule } from './screens/ReviewSchedule';
import { Activity } from './screens/Activity';
import { UndoNotice } from './components/UndoNotice';
import { RemovalReviewScreen } from './screens/RemovalReview';
import { TwoFactorGate } from './components/TwoFactor';
import { LayoutPreferencesProvider } from './layoutPreferences';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useKey } from './components/bits';
import { Header, BottomNav, EnvBanner, ShellModals, TabBar, Footer } from './components/Shell';
import { Search } from './components/Search';
import { ShortcutHelp } from './components/shortcuts';
import { NewComposition } from './components/NewComposition';
import { UiContext, type NewCompositionStart } from './ui';
import { TodoPage as Todo } from './screens/Todo';
import { Home } from './screens/Home';
import { Library } from './screens/Library';
import { GoContext } from './proto/runtime';
import { Photo as PhotoDetail } from './screens/Photo';
import { Review } from './screens/Review';
import { Shoots } from './screens/Shoots';
import { Compositions } from './screens/Compositions';
import { Editor as CollectionDetail } from './screens/Editor';
import { Stats } from './screens/Stats';
import { SettingsPage } from './settings/SettingsPage';
import { Compare, Duplicates } from './screens/Compare';
import { SharePage } from './pages/SharePage';
import { Welcome } from './screens/Welcome';
import { Community } from './screens/Community';
import { Gear } from './screens/Gear';
import { GuestHome } from './pages/GuestHome';
import { api, openPortfolio } from './api';
import { AUTH_PATHS, AuthApp } from './pages/Auth';
import { useStore } from './store';
import { usePhoneWidth } from './usePhoneWidth';
import { tabFor } from './mobile/Chrome';
import { MobileNotifications } from './mobile/Notifications';
import { MobileOrganise } from './mobile/Organise';

const PAGE_NAMES: Record<string, string> = {
  '/activity': 'Recently removed & changes', '/imports': 'Import history', '/review-schedule': 'Review schedule', '/gear-history': 'Wishlist history',
  '/': 'Today', '/library': 'Library', '/review': 'Review', '/removals': 'Removal review', '/shoots': 'Shoots', '/compare': 'Compare', '/duplicates': 'Duplicates',
  '/collections': 'Compositions', '/community': 'Community review', '/gear': 'Gear & wishlist', '/todo': 'To do', '/stats': 'Stats', '/welcome': 'Welcome', '/settings': 'Settings',
};
/** Pages that name themselves (a composition, a photoshoot, a photograph) are left alone. */
const NAMES_ITSELF = /^\/(photo|shoots|collections)\/[^/]+/;

/** Pages that only exist in the phone layout: a wider screen goes Home instead. */
function PhoneOnly({ children }: { children: React.ReactNode }) {
  return usePhoneWidth() ? <>{children}</> : <Navigate to="/" replace />;
}

function Shell() {
  const [searching, setSearching] = useState(false);
  const [help, setHelp] = useState(false);
  const [creating, setCreating] = useState<NewCompositionStart | null>(null);
  const { refreshSummary, summary } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const phone = usePhoneWidth();
  const inReview = loc.pathname === '/review' || loc.pathname === '/removals';
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
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role=dialog]')) return;
    if (e.key === '?' && !inReview && !searching) { e.preventDefault(); setHelp(true); return; }
    if (e.key === '/' && !inReview && !searching) { e.preventDefault(); setSearching(true); return; }
    if (e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey && !e.altKey && !searching) { e.preventDefault(); nav('/todo'); return; }
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !inReview && !searching) nav(summary && summary.due === 0 && !summary.resumable && summary.early > 0 ? '/review?early' : '/review'); // nothing due: begin anyway
  }, [inReview, searching, summary]);
  useEffect(() => { refreshSummary(); }, [loc.pathname, refreshSummary]);

  return (
    <GoContext.Provider value={(to) => {
      const map: Record<string, string> = { home: '/', shoots: '/shoots', library: '/library', compositions: '/collections', review: '/review', community: '/community', settings: '/settings', gear: '/gear', stats: '/stats', todo: '/todo', welcome: '/welcome', dupes: '/duplicates', compare: '/compare', editor: '/collections' };
      if (to === 'search') setSearching(true); else if (to === 'portfolio') void openPortfolio(); else if (to.startsWith('/')) nav(to); else if (map[to]) nav(map[to]);
    }}>
    <UiContext.Provider value={{ openSearch: () => setSearching(true), openNew: (s) => { setSearching(false); setCreating(s ?? {}); } }}>
      {!inReview && <EnvBanner />}
      {!inReview && !(phone && tabFor(loc.pathname, loc.search) && loc.pathname !== '/') && <div className="app-header"><Header /></div>}
      <div className="app-content"><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/library" element={<Library />} />
        <Route path="/notifications" element={<PhoneOnly><MobileNotifications /></PhoneOnly>} />
        <Route path="/reviews" element={<Navigate to="/todo" replace />} />
        <Route path="/organise" element={<PhoneOnly><MobileOrganise /></PhoneOnly>} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/imports" element={<Navigate to="/stats?tab=imports" replace />} />
        <Route path="/review-schedule" element={<ReviewSchedule />} />
        <Route path="/photo/:id" element={<PhotoDetail />} />
        <Route path="/review" element={<Review />} />
        <Route path="/removals" element={<RemovalReviewScreen />} />
        <Route path="/shoots" element={<Shoots />} />
        <Route path="/shoots/:id" element={<Shoots />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/duplicates" element={<Duplicates />} />
        <Route path="/collections" element={<Compositions />} />
        <Route path="/collections/:id" element={<CollectionDetail />} />
        <Route path="/community" element={<Community />} />
        <Route path="/gear" element={<Gear />} />
        <Route path="/gear-history" element={<WishlistHistory />} />
        <Route path="/todo" element={<Todo />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<Navigate to={`/settings?section=access${window.location.search.replace(/^\?/, '&')}`} replace />} />
        <Route path="*" element={<Home />} />
      </Routes></div>
      {!inReview && <Footer />}
      {!inReview && loc.pathname !== '/welcome' && <BottomNav />}
      {!inReview && <TabBar />}
      <ShellModals />
      <UndoNotice />
      {searching && <Search onClose={() => setSearching(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
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
  if (me?.mfa?.required && !me.mfa.verified) return <TwoFactorGate />;
  if (me?.role === 'guest') return <GuestHome />; // a guest has no library, so none of the app
  return <LayoutPreferencesProvider><Shell /></LayoutPreferencesProvider>;
}
