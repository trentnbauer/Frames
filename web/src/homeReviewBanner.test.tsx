import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ProtoHome from './proto/ProtoHome';
import { HomeReviewBanner } from './components/HomeReviewBanner';

it('uses the shared theme-aware card for the Home anytime review state', () => {
  const html = renderToStaticMarkup(<ProtoHome v={{ showReview: true, sug: { photos: [], colours: [], tags: [] }, wall: { prints: [] }, s: { photos: 0 }, recents: [], ideas: [], revTag: 'ANYTIME', revTitle: 'Nothing is waiting to be seen again', revSub: 'Come back when the next ones are due.', revCover: '/cover.jpg', revCta: 'Review anyway' }} />);
  expect(html).toContain('class="home-review-card"');
  expect(html).toContain('Nothing is waiting to be seen again');
  expect(html).toContain('home-review-backdrop');
});
it('uses theme foreground and button colours with or without a photo', () => {
  for (const cover of [undefined, '/cover.jpg']) {
    const html = renderToStaticMarkup(<HomeReviewBanner cover={cover} tag="ANYTIME" title="Nothing is waiting" description="Come back later" buttonLabel="Review anyway" onBegin={() => {}} />);
    expect(html).toContain('color:var(--text2)');
    expect(html).toContain('btn primary lg');
    expect(html).not.toContain('#efede8');
    expect(html).not.toContain('brightness(.45)');
  }
});
