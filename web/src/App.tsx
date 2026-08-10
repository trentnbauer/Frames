import { useEffect, useState } from 'react';
import { PhotoGrid } from './pages/PhotoGrid.js';
import { Ideas } from './pages/Ideas.js';
import { IdeaDetail } from './pages/IdeaDetail.js';
import { GapFinder } from './pages/GapFinder.js';
import { Orphans } from './pages/Orphans.js';
import { Settings } from './pages/Settings.js';
import { navigate, parseRoute, type Route } from './router.js';

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const { tab, ideaId: openIdeaId } = route;

  function goToIdea(id: number) {
    navigate({ tab: 'ideas', ideaId: id });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Frames</h1>
        <nav>
          <button className={tab === 'grid' ? 'active' : ''} onClick={() => navigate({ tab: 'grid', ideaId: null })}>Photos</button>
          <button className={tab === 'ideas' ? 'active' : ''} onClick={() => navigate({ tab: 'ideas', ideaId: null })}>Ideas</button>
          <button className={tab === 'gaps' ? 'active' : ''} onClick={() => navigate({ tab: 'gaps', ideaId: null })}>Gap finder</button>
          <button className={tab === 'orphans' ? 'active' : ''} onClick={() => navigate({ tab: 'orphans', ideaId: null })}>Orphans</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => navigate({ tab: 'settings', ideaId: null })}>Settings</button>
        </nav>
      </header>

      <main className="app-main">
        {tab === 'grid' && <PhotoGrid onAddedToIdea={goToIdea} />}
        {tab === 'ideas' && openIdeaId === null && <Ideas onOpenIdea={goToIdea} />}
        {tab === 'ideas' && openIdeaId !== null && (
          <IdeaDetail ideaId={openIdeaId} onBack={() => navigate({ tab: 'ideas', ideaId: null })} />
        )}
        {tab === 'gaps' && <GapFinder onStartIdea={goToIdea} />}
        {tab === 'orphans' && <Orphans />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
