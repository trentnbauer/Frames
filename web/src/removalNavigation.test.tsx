import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { BottomNav, TabBar } from './components/Shell';
import { RemovalReviewScreen } from './screens/RemovalReview';
const state = vi.hoisted(() => ({ todo: 0, removals: 0, refreshSummary: vi.fn() }));
vi.mock('./store', () => ({ useStore: () => state }));
vi.mock('./ui', () => ({ useUi: () => ({ openSearch: vi.fn() }) }));
vi.mock('./components/RemovalReview', () => ({ RemovalReview: () => <section>Photo and personal rating history</section> }));
beforeEach(() => { state.removals = 0; });
it('groups desktop tasks under To do and has no separate removal tab on phones', () => {
  const desktop = renderToStaticMarkup(<MemoryRouter><BottomNav /></MemoryRouter>);
  expect(desktop).toContain('aria-controls="todo-navigation"');
  expect(desktop).not.toContain('href="/removals"');
  state.removals = 2;
  const phone = renderToStaticMarkup(<MemoryRouter><TabBar /></MemoryRouter>);
  expect(phone).not.toContain('href="/removals"');
  expect(phone).toContain('>Shoots<');
  expect(phone).toContain('>Compositions<');
  expect(phone).toContain('>Done<');
  state.removals = 0;
});
it('renders a dedicated immersive review view with an exit control', () => {
  const html = renderToStaticMarkup(<MemoryRouter><RemovalReviewScreen /></MemoryRouter>);
  expect(html).toContain('class="removal-screen"');
  expect(html).toContain('>Back</button>');
  expect(html).toContain('Photo and personal rating history');
});
