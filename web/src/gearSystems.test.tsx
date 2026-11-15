import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GearSystems, gearSystems, GearIcon } from './components/GearSystems';
const item = { id: 1, name: 'Minolta XD', system: '', type: 'camera', serial: '', year: 1977, used: 12 };
it('keeps raw blank systems distinct from named Other and remembers empty systems', () => {
  expect(gearSystems([item, { ...item, id: 2, system: 'Other' }], ['Leica M'])).toEqual(['Leica M', '', 'Other']);
});
it('renders the system sidebar and accessible move/edit alternatives', () => {
  const html = renderToStaticMarkup(<GearSystems items={[item]} systems={[]} onChanged={async () => {}} />);
  for (const text of ['Unassigned', 'Rename system', 'Move Minolta XD to system', 'Edit Minolta XD', '12 photos', 'Gear systems']) expect(html).toContain(text);
  expect(html).toContain('draggable="true"');
});
it('uses consistent stroked SVG icons for each equipment type', () => {
  for (const type of ['camera', 'lens', 'film', 'light', 'app', 'other']) {
    const html = renderToStaticMarkup(<GearIcon type={type} />);
    expect(html).toContain('stroke-width="1.4"'); expect(html).toContain('aria-hidden="true"');
  }
});
