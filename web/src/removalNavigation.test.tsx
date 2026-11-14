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
it('shows the removal tab only for an eligible queue on desktop and phones', () => {
  for (const Component of [BottomNav, TabBar]) {
    const html = () => renderToStaticMarkup(<MemoryRouter><Component /></MemoryRouter>);
    expect(html()).not.toContain('href="/removals"');
    state.removals = 2;
    expect(html()).toContain('href="/removals"');
    expect(html()).toContain('Removal review');
    state.removals = 0;
    expect(html()).not.toContain('href="/removals"');
  }
});
it('renders a dedicated immersive review view with an exit control', () => {
  const html = renderToStaticMarkup(<MemoryRouter><RemovalReviewScreen /></MemoryRouter>);
  expect(html).toContain('class="removal-screen"');
  expect(html).toContain('>Back</button>');
  expect(html).toContain('Photo and personal rating history');
});
