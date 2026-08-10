// Small hand-rolled router: no dependency, just enough History API wiring so
// the browser's back/forward buttons step through app views instead of
// leaving the SPA entirely.

export type Screen = 'dashboard' | 'library' | 'import' | 'settings' | 'project';

export interface Route {
  screen: Screen;
  projectId: number | null;
}

const SCREEN_PATHS: Record<Exclude<Screen, 'project'>, string> = {
  dashboard: '/',
  library: '/library',
  import: '/import',
  settings: '/settings',
};

export function parseRoute(): Route {
  const { pathname } = window.location;

  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) return { screen: 'project', projectId: Number(projectMatch[1]) };

  const screen = (Object.keys(SCREEN_PATHS) as (keyof typeof SCREEN_PATHS)[]).find(
    (s) => SCREEN_PATHS[s] === pathname
  );
  return { screen: screen ?? 'dashboard', projectId: null };
}

function pathFor(route: Route): string {
  return route.projectId != null ? `/projects/${route.projectId}` : SCREEN_PATHS[route.screen as Exclude<Screen, 'project'>];
}

export function navigate(route: Route) {
  const path = pathFor(route);
  if (path !== window.location.pathname) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
