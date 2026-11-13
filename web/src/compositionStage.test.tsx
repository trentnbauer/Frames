import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompositionStage } from './components/CompositionStage';
import ProtoCompositions from './proto/ProtoCompositions';
import ProtoEditor from './proto/ProtoEditor';
import { Logic } from './proto/ProtoEditor.logic';
import { Logic as ListLogic } from './proto/ProtoCompositions.logic';

const noop = async () => {};
describe('composition lifecycle controls', () => {
  it('shows Progress, Review and Done while editing; empty slots block Review and Done', () => {
    const html = renderToStaticMarkup(<CompositionStage value="progress" full={false} onChange={noop} />);
    expect(html).toContain('aria-label="Composition stage"');
    for (const name of ['Progress', 'Review', 'Done']) expect(html).toContain(name);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    const full = renderToStaticMarkup(<CompositionStage value="review" full onChange={noop} />);
    expect(full).not.toContain('disabled=""');
  });
  it('keeps the three stages visible while Done', () => {
    const html = renderToStaticMarkup(<CompositionStage value="done" full onChange={noop} />);
    expect(html).not.toContain('>Edit</button>');
    expect(html).toContain('aria-label="Composition stage"');
    for (const name of ['Progress', 'Review', 'Done']) expect(html).toContain(name);
    expect(html).toContain('aria-pressed="true"');
  });
  it('hides mutation controls in Done, keeps view controls and only shows Export there', () => {
    const props = { name: 'Neon Interiors', prints: [], order: [], unrated: [], share: { active: false } };
    const done = renderToStaticMarkup(<ProtoEditor {...props} readOnly showExport stageControl={<CompositionStage value="done" full onChange={noop} />} />);
    for (const text of ['Done · Read-only', 'Progress', 'Review', 'Done', 'Export', 'Share', 'Guests', 'Fullscreen']) expect(done).toContain(text);
    expect(done.indexOf('>Export')).toBeGreaterThan(done.indexOf('<aside'));
    expect(done).toContain('background-color:var(--wall-bg)');
    expect(done).toContain('class="composition-header"');
    for (const text of ['+ Print', 'Line up', '+ Add photos', 'Help me decide', 'Nothing selected']) expect(done).not.toContain(text);
    expect(renderToStaticMarkup(<ProtoEditor {...props} />)).not.toMatch(/>Export(?: |<)/);
  });
  it('ignores stale drag, placement, add, arrange and remove actions while Done', () => {
    const save = vi.fn(); const logic = new Logic();
    logic.props = { readOnly: true, prints: [], order: [1], photoMeta: () => ['Test', '', 0], photoUrl: () => '/photo', onPrints: save, onRemoveCandidate: vi.fn() };
    logic.place(1, 1, 0); logic.upd(1, {}); logic.startDrag({ button: 0 }, {});
    logic.wallVals().addPrint(); logic.wallVals().tidy();
    expect(logic.pr()).toEqual([]); expect(save).not.toHaveBeenCalled();
    expect(logic.candVals().cands[0].remove).toBeNull();
  });
  it('uses explicit list stages instead of inferring completion from the artwork count', () => {
    const logic = new ListLogic();
    logic.props = { prog: [{ id: 1 }], review: [{ id: 2 }], ready: [{ id: 3 }], sortLabel: () => '', onOpen: vi.fn() };
    expect(logic.renderVals().tabs.map((t: { label: string }) => t.label)).toEqual(['Progress', 'Review', 'Done']);
    logic.state.tab = 'review'; expect(logic.renderVals().compsAfter[0].id).toBe(2);
    logic.state.tab = 'done'; expect(logic.renderVals().isReady).toBe(true); expect(logic.renderVals().isProg).toBe(false);
    logic.state.tab = ''; logic.props.initialTab = 'done'; expect(logic.renderVals().isReady).toBe(true);
  });
});

it('keeps the list title, actions and workflow controls in one sticky header', () => {
  const html = renderToStaticMarkup(<ProtoCompositions prog={[]} review={[]} ready={[]} sortLabel={() => 'Last edited'} />);
  expect(html).toContain('class="compositions-list-header"');
  for (const label of ['Compositions', 'New composition', 'Progress', 'Review', 'Done', 'Find a composition']) expect(html).toContain(label);
});

it('marks composition ideas only when their data is AI-assisted', () => {
  for (const aiAssisted of [false, true]) {
    const html = renderToStaticMarkup(<ProtoCompositions prog={[]} review={[]} ready={[]} sortLabel={() => 'Last edited'} sugg={{ name: 'Blue tones', why: 'Shared colour: blue.', thumbs: [], aiAssisted }} />);
    expect(html.includes('aria-label="AI-assisted idea"')).toBe(aiAssisted);
  }
});
