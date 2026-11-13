import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logic } from './proto/ProtoEditor.logic';
import { WallButton } from './components/WallButton';

describe('composition wall controls', () => {
  it('keeps black mat material independent of the app theme', () => {
    expect(new Logic().MAT.Black).not.toContain('var(');
  });
  it('uses theme colours for both the button surface and its text', () => {
    const html = renderToStaticMarkup(<WallButton>Room photo</WallButton>);
    expect(html).toContain('background:var(--wall-control-bg)');
    expect(html).toContain('color:var(--text)');
    expect(html).not.toContain('rgba(13,13,13');
  });
});

it('moves frames and the background in lockstep without geometry transitions', () => {
  const logic = new Logic();
  logic.props = { prints: [{ id: 1, size: 'A3', or: 'P', x: 0, y: 0, framed: true, frame: 'A2', colour: 'Black', mat: 'White', photo: null }] };
  const before = logic.wallVals();
  logic.state.view = { zoom: 1, x: 72, y: 31 };
  const moved = logic.wallVals();
  expect(parseFloat(moved.prints[0].left) - parseFloat(before.prints[0].left)).toBe(72);
  expect(parseFloat(moved.prints[0].top) - parseFloat(before.prints[0].top)).toBe(31);
  const position = (value: string) => value.split(' ').map(parseFloat);
  expect(position(moved.gridPosition).map((value, i) => value - position(before.gridPosition)[i])).toEqual([72, 31]);
  expect(moved.prints[0].trans).not.toMatch(/left|top|width|height|all/);
  logic.state.view = { zoom: 2, x: 72, y: 31 };
  expect(Math.abs(parseFloat(logic.wallVals().prints[0].w) - 2 * parseFloat(before.prints[0].w))).toBeLessThanOrEqual(1);
});
