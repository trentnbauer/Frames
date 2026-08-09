import { useState } from 'react';
import { PhotoGrid } from './pages/PhotoGrid.js';
import { Ideas } from './pages/Ideas.js';
import { IdeaDetail } from './pages/IdeaDetail.js';
import { GapFinder } from './pages/GapFinder.js';
import { Orphans } from './pages/Orphans.js';
import { Settings } from './pages/Settings.js';

type Tab = 'grid' | 'ideas' | 'gaps' | 'orphans' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('grid');
  const [openIdeaId, setOpenIdeaId] = useState<number | null>(null);

  function goToIdea(id: number) {
    setOpenIdeaId(id);
    setTab('ideas');
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Frames</h1>
        <nav>
          <button className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>Photos</button>
          <button
            className={tab === 'ideas' ? 'active' : ''}
            onClick={() => {
              setOpenIdeaId(null);
              setTab('ideas');
            }}
          >
            Ideas
          </button>
          <button className={tab === 'gaps' ? 'active' : ''} onClick={() => setTab('gaps')}>Gap finder</button>
          <button className={tab === 'orphans' ? 'active' : ''} onClick={() => setTab('orphans')}>Orphans</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>
      </header>

      <main className="app-main">
        {tab === 'grid' && <PhotoGrid onAddedToIdea={goToIdea} />}
        {tab === 'ideas' && openIdeaId === null && <Ideas onOpenIdea={(id) => setOpenIdeaId(id)} />}
        {tab === 'ideas' && openIdeaId !== null && (
          <IdeaDetail ideaId={openIdeaId} onBack={() => setOpenIdeaId(null)} />
        )}
        {tab === 'gaps' && <GapFinder onStartIdea={goToIdea} />}
        {tab === 'orphans' && <Orphans />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
