import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Collection } from '../data';
import type { Print } from '../layout';
import { CompositionPreview } from './CompositionPreview';
import { Logic } from '../proto/ProtoEditor.logic';

describe('composition previews and room pictures', () => {
  it('renders saved positions, both stacked photos and the saved crop using thumbnails', () => {
    const prints: Print[] = [
      { id: 1, x: -200, y: -300, size: 'A3', orientation: 'portrait', frame: null, photoId: 1, photoId2: null, stack: false, crop: { zoom: 1.5, shiftX: 10, shiftY: -5 } },
      { id: 2, x: 500, y: 400, size: 'A4', orientation: 'landscape', frame: { size: 'A3', color: 'oak', mat: 'white' }, photoId: 2, photoId2: 3, stack: true },
    ];
    const c = { name: 'Wall', layout: { mode: 'free', prints } } as Collection;
    const photos = new Map([1, 2, 3].map((id) => [id, { id, title: `Photo ${id}`, w: 1200, h: 800, ar: 1.5 }]));
    const html = renderToStaticMarkup(<CompositionPreview collection={c} photos={photos} />);
    expect((html.match(/<img /g) ?? [])).toHaveLength(3);
    expect(html).toContain('scale(1.5)');
    expect(html).toContain('/api/photos/3/thumb');
    expect(html).toContain('data-mode="free"');
    expect(html).not.toContain('Print 1 ·');
    expect(renderToStaticMarkup(<CompositionPreview collection={{ ...c, layout: { ...c.layout, mode: 'row' } }} photos={photos} />)).not.toBe(html);
  });
  it('moves and scales a room picture together with the wall view', () => {
    const logic = new Logic();
    logic.props = { prints: [], roomImage: { url: '/room.jpg', w: 300, h: 200 } };
    const before = logic.wallVals();
    logic.setState({ view: { zoom: 2, x: 30, y: -10 } });
    const after = logic.wallVals();
    expect(after.wallBackground).toBe('url(/room.jpg)');
    expect(after.wallRepeat).toBe('no-repeat');
    expect(Math.abs(parseFloat(after.gridSize) - parseFloat(before.gridSize) * 2)).toBeLessThanOrEqual(1);
    expect(after.gridPosition).not.toBe(before.gridPosition);
  });
});
