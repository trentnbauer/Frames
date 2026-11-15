import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sameShootGear, SameShootGear } from './components/SameShootGear';
const current = { id: 1, shootId: 4, camera: '', lens: '' };
it('finds camera and lens independently within the shoot, including lens-only peers', () => {
  expect(sameShootGear([{ ...current, id: 2, lens: '50mm' }, { ...current, id: 3, camera: 'Minolta XD' }, { ...current, id: 5, shootId: 8, lens: 'Other lens' }], current)).toEqual({ camera: 'Minolta XD', lens: '50mm' });
});
it('does not borrow gear from the current photo, another shoot or unassigned photos', () => {
  expect(sameShootGear([{ ...current, camera: 'Self', lens: 'Self lens' }, { ...current, id: 2, shootId: 8, camera: 'Other' }], current)).toEqual({ camera: '', lens: '' });
  expect(sameShootGear([{ ...current, id: 2, shootId: null, lens: 'Unassigned' }], { ...current, shootId: null })).toEqual({ camera: '', lens: '' });
});
it('renders separate accessible same-shoot actions and hides empty suggestions', () => {
  const html = renderToStaticMarkup(<SameShootGear camera="Minolta XD" lens="50mm" onUse={() => {}} />);
  expect(html).toContain('Use camera Minolta XD from the same shoot');
  expect(html).toContain('Use lens 50mm from the same shoot');
  expect(html).not.toContain('same roll');
  expect(renderToStaticMarkup(<SameShootGear camera="" lens="" onUse={() => {}} />)).toBe('');
});
