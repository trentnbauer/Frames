// Small hand-rolled router: no dependency, just enough History API wiring so
// the browser's back/forward buttons step through app views instead of
// leaving the SPA entirely.

export type Screen = 'dashboard' | 'library' | 'settings' | 'project';

export interface Route {
  screen: Screen;
  projectId: number | null;
  // Library-only: set when arriving via a project's "Add Photos" button, so
  // uploads on that visit get added straight to that project instead of
  // just landing in the general library.
  forProjectId?: number | null;
}

const SCREEN_PATHS: Record<Exclude<Screen, 'project'>, string> = {
  dashboard: '/',
  library: '/library',
  settings: '/settings',
};

export function parseRoute(): Route {
  const { pathname, search } = window.location;

  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) return { screen: 'project', projectId: Number(projectMatch[1]) };

  // Import was folded into Library — keep old /import links/bookmarks working.
  if (pathname === '/import') return { screen: 'library', projectId: null };

  if (pathname === SCREEN_PATHS.library) {
    const forProject = new URLSearchParams(search).get('project');
    return { screen: 'library', projectId: null, forProjectId: forProject ? Number(forProject) : null };
  }

  const screen = (Object.keys(SCREEN_PATHS) as (keyof typeof SCREEN_PATHS)[]).find(
    (s) => SCREEN_PATHS[s] === pathname
  );
  return { screen: screen ?? 'dashboard', projectId: null };
}

function pathFor(route: Route): string {
  if (route.projectId != null) return `/projects/${route.projectId}`;
  if (route.screen === 'library' && route.forProjectId != null) return `/library?project=${route.forProjectId}`;
  return SCREEN_PATHS[route.screen as Exclude<Screen, 'project'>];
}

export function navigate(route: Route) {
  const path = pathFor(route);
  if (path !== window.location.pathname + window.location.search) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
