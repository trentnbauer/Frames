import { useEffect, useState } from 'react';
import { api } from './api.js';
import type { Idea } from './types.js';
import { navigate, parseRoute, type Route } from './router.js';
import { Dashboard } from './pages/Dashboard.js';
import { Library } from './pages/Library.js';
import { Import } from './pages/Import.js';
import { Orphans } from './pages/Orphans.js';
import { Settings } from './pages/Settings.js';
import { ProjectDetail } from './pages/ProjectDetail.js';
import { NewProjectModal } from './components/NewProjectModal.js';

interface NewProjectRequest {
  initialTitle?: string;
  onCreated?: (idea: Idea) => void | Promise<void>;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [newProjectRequest, setNewProjectRequest] = useState<NewProjectRequest | null>(null);

  async function refreshIdeas() {
    const res = await api.ideas.list();
    setIdeas(res.ideas);
  }

  useEffect(() => {
    refreshIdeas();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function goTo(screen: Route['screen'], projectId: number | null = null) {
    navigate({ screen, projectId });
  }

  function openNewProject(request: NewProjectRequest = {}) {
    setNewProjectRequest(request);
  }

  async function handleProjectCreated(idea: Idea) {
    await newProjectRequest?.onCreated?.(idea);
    setNewProjectRequest(null);
    await refreshIdeas();
    goTo('project', idea.id);
  }

  return (
    <div className="app-shell">
      <div className="sidebar" style={{ width: sidebarCollapsed ? 72 : 232 }}>
        <div className="sidebar__brand">
          <div className="sidebar__brand-dot" />
          {!sidebarCollapsed && <div className="sidebar__brand-name">Frames</div>}
          <button className="sidebar__collapse" onClick={() => setSidebarCollapsed((c) => !c)} title="Collapse sidebar">
            <div className="sidebar__collapse-arrow" style={{ transform: `rotate(${sidebarCollapsed ? '-45deg' : '135deg'})` }} />
          </button>
        </div>

        <button className={`nav-item ${route.screen === 'dashboard' ? 'active' : ''}`} onClick={() => goTo('dashboard')} title="Dashboard">
          <span className="nav-item__icon">D</span>
          {!sidebarCollapsed && <span>Dashboard</span>}
        </button>
        <button className={`nav-item ${route.screen === 'library' ? 'active' : ''}`} onClick={() => goTo('library')} title="Library">
          <span className="nav-item__icon">L</span>
          {!sidebarCollapsed && <span>Library</span>}
        </button>
        <button className={`nav-item ${route.screen === 'import' ? 'active' : ''}`} onClick={() => goTo('import')} title="Import">
          <span className="nav-item__icon">I</span>
          {!sidebarCollapsed && <span>Import</span>}
        </button>
        <button className={`nav-item ${route.screen === 'orphans' ? 'active' : ''}`} onClick={() => goTo('orphans')} title="Orphans">
          <span className="nav-item__icon">O</span>
          {!sidebarCollapsed && <span>Orphans</span>}
        </button>

        {!sidebarCollapsed && (
          <>
            <div className="sidebar__section-label">Projects</div>
            <div className="sidebar__projects scrollarea">
              {ideas.map((idea) => (
                <button
                  key={idea.id}
                  className={`sidebar__project-row ${route.screen === 'project' && route.projectId === idea.id ? 'active' : ''}`}
                  onClick={() => goTo('project', idea.id)}
                >
                  <span className="sidebar__project-row-name">{idea.title}</span>
                  <span className="sidebar__project-row-count">{idea.photo_count ?? 0}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sidebar__spacer" />
        <button className="sidebar__settings-row" onClick={() => goTo('settings')} title="Settings">
          <span className="nav-item__icon">S</span>
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
        <button className="sidebar__new-project" onClick={() => openNewProject()} title="New Project">
          {sidebarCollapsed ? '+' : '+ New Project'}
        </button>
      </div>

      <div className="main-scroll scrollarea">
        <div className="main-content">
          {route.screen === 'dashboard' && (
            <Dashboard
              ideas={ideas}
              onOpenProject={(id) => goTo('project', id)}
              onImport={() => goTo('import')}
              onNewProject={() => openNewProject()}
              onGenerateProject={(title, onCreated) => openNewProject({ initialTitle: title, onCreated })}
            />
          )}
          {route.screen === 'library' && <Library onOpenProject={(id) => goTo('project', id)} />}
          {route.screen === 'import' && <Import />}
          {route.screen === 'orphans' && <Orphans />}
          {route.screen === 'settings' && <Settings />}
          {route.screen === 'project' && route.projectId !== null && (
            <ProjectDetail
              projectId={route.projectId}
              onBack={() => goTo('dashboard')}
              onImport={() => goTo('import')}
              onDeleted={() => {
                refreshIdeas();
                goTo('dashboard');
              }}
              onChanged={refreshIdeas}
            />
          )}
        </div>
      </div>

      <NewProjectModal
        open={newProjectRequest !== null}
        initialTitle={newProjectRequest?.initialTitle}
        onClose={() => setNewProjectRequest(null)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
