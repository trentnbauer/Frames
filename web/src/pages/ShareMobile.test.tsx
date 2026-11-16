import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShareMobile } from './ShareMobile';

const props = (over: Record<string, unknown> = {}) => ({
  token: 't', reviewer: '', withName: () => undefined, changeName: () => undefined, wallPrints: [], others: [],
  photos: [{ id: 1, title: 'One', ar: 1.5, n: 1 }, { id: 2, title: 'Two', ar: 0.8, n: 2 }],
  d: { name: 'Coastal Light', description: '', allowReview: true, allowDownload: true, expiresAt: null, owner: 'Trent' },
  mine: {}, frames: {}, swap: () => undefined, setFrame: () => undefined, changes: 0, dirty: false, sending: false, sendNote: null, sendBack: () => undefined, discard: () => undefined, sugErr: '',
  dl: null, download: () => undefined, cancelDl: () => undefined, openLayout: () => undefined, layoutSent: false, ...over,
}) as unknown as Parameters<typeof ShareMobile>[0];

describe('the shared photoshoot on a phone', () => {
  it('shows the shoot, a download card, the filters and a progress bar when guests may rate and download', () => {
    const html = renderToStaticMarkup(<ShareMobile {...props()} />);
    expect(html).toContain('A PHOTOSHOOT · 2 PHOTOGRAPHS');
    expect(html).toContain('Coastal Light');
    expect(html).toContain('Download all 2');
    expect(html).toContain('To rate');
    expect(html).toContain('0 of 2 rated');
  });

  it('leaves out rating, filters and downloads when the link does not allow them', () => {
    const html = renderToStaticMarkup(<ShareMobile {...props({ d: { name: 'Coastal Light', description: '', allowReview: false, allowDownload: false, expiresAt: null, owner: 'Trent' } })} />);
    expect(html).not.toContain('To rate');
    expect(html).not.toContain('Download all');
    expect(html).not.toContain('rated');
    expect(html).toContain('All photographs');
  });
});
