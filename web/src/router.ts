// Small hand-rolled router: no dependency, just enough History API wiring so
// the browser's back/forward buttons step through app views instead of
// leaving the SPA entirely (there was previously no URL state at all).

export type Tab = 'grid' | 'ideas' | 'gaps' | 'orphans' | 'settings';

export interface Route {
  tab: Tab;
  ideaId: number | null;
}

const TAB_PATHS: Record<Tab, string> = {
  grid: '/',
  ideas: '/ideas',
  gaps: '/gaps',
  orphans: '/orphans',
  settings: '/settings',
};

export function parseRoute(): Route {
  const { pathname } = window.location;

  const ideaMatch = pathname.match(/^\/ideas\/(\d+)$/);
  if (ideaMatch) return { tab: 'ideas', ideaId: Number(ideaMatch[1]) };

  const tab = (Object.keys(TAB_PATHS) as Tab[]).find((t) => TAB_PATHS[t] === pathname) ?? 'grid';
  return { tab, ideaId: null };
}

function pathFor(route: Route): string {
  return route.ideaId != null ? `/ideas/${route.ideaId}` : TAB_PATHS[route.tab];
}

export function navigate(route: Route) {
  const path = pathFor(route);
  if (path !== window.location.pathname) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}
