import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PhotoColourVariants } from './components/PhotoColourVariants';
import { AddToComposition } from './components/AddToComposition';
import { Logic } from './proto/ProtoEditor.logic';
import type { PhotoFull, PhotoLite } from './data';

describe('photo and composition actions', () => {
  it('counts actual linked variants, including the original and siblings when viewing a variant', () => {
    const photos = [{ id: 1, parentId: null }, { id: 2, parentId: 1 }, { id: 3, parentId: 1 }, { id: 4, parentId: null }] as PhotoLite[];
    const html = renderToStaticMarkup(<PhotoColourVariants photo={{ id: 2, parentId: 1 } as PhotoFull} photos={photos} />);
    expect(html).toContain('2 variants');
    expect(renderToStaticMarkup(<PhotoColourVariants photo={{ id: 4, parentId: null } as PhotoFull} photos={photos} />)).toContain('0 variants');
  });

  it('renders the shared composition action for a to-do photograph and disables an empty selection', () => {
    expect(renderToStaticMarkup(<AddToComposition ids={[7]} onDone={() => {}} />)).toContain('aria-haspopup="dialog"');
    expect(renderToStaticMarkup(<AddToComposition ids={[]} onDone={() => {}} />)).toContain('disabled');
  });

  it('uses thumbnails for candidate previews and removes the selected candidate through the host callback', async () => {
    const remove = vi.fn();
    const logic = new Logic();
    logic.props = { prints: [], order: [7], photoMeta: () => ['Harbour', '', 4], photoUrl: (id: number) => `/preview/${id}`, photoThumb: (id: number) => `/thumb/${id}`, onRemoveCandidate: remove };
    const candidate = logic.candVals().cands[0];
    expect(candidate.src).toBe('/thumb/7');
    await candidate.remove();
    expect(remove).toHaveBeenCalledWith(7);
    logic.props.guest = true;
    expect(logic.candVals().cands[0].remove).toBeNull();
  });
});
