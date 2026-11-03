import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav, useKey } from './components/bits';
import { Changelog } from './components/Changelog';
import { Search } from './components/Search';
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
import { useStore } from './store';

function Shell() {
  const [searching, setSearching] = useState(false);
  const { refreshSummary } = useStore();
  const loc = useLocation();
  const nav = useNavigate();
  const inReview = loc.pathname === '/review';

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
    if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !inReview && !searching) nav('/review');
  }, [inReview, searching]);
  useEffect(() => { refreshSummary(); }, [loc.pathname, refreshSummary]);

  return (
    <>
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
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Today />} />
      </Routes>
      {!inReview && <BottomNav onSearch={() => setSearching(true)} />}
      {!inReview && <Changelog />}
      {searching && <Search onClose={() => setSearching(false)} />}
    </>
  );
}

/**
 * A share link opens a page of its own. It must not start the signed-in app (which would call the
 * login-protected API and, in a browser, pop up a password box for someone who has no password).
 */
export function App() {
  const loc = useLocation();
  if (loc.pathname.startsWith('/s/')) return <Routes><Route path="/s/:token" element={<SharePage />} /><Route path="*" element={<SharePage />} /></Routes>;
  return <Shell />;
}
