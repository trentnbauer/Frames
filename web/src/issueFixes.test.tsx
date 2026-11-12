import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ProtoPhoto from './proto/ProtoPhoto';
import ProtoAuth from './proto/ProtoAuth';
import { EditableCompositionName } from './components/EditableCompositionName';
import { Logic } from './proto/ProtoEditor.logic';

describe('photo tag provenance', () => {
  it('puts an AI marker before AI tag names and keeps a separate remove action', () => {
    const html = renderToStaticMarkup(<ProtoPhoto inComps={[]} tags={[{ label: 'neon', accepted: true }, { label: 'interiors', accepted: false }]} />);
    expect(html).toContain('aria-label="Added by AI">✦</span>neon');
    expect(html).not.toContain('Accepted AI suggestion');
    expect(html).toContain('aria-label="Remove tag neon"');
    expect(html).toContain('aria-label="Remove tag interiors"');
    expect(html.match(/Added by AI/g)).toHaveLength(2); // title and accessible label on one AI tag
  });
});
describe('composition controls', () => {
  it('renders an editable title, including punctuation safely', () => {
    const html = renderToStaticMarkup(<EditableCompositionName name={'Neon & "Interiors"'} onSave={async () => {}} />);
    expect(html).toContain('aria-label="Composition name"');
    expect(html).toContain('maxLength="120"');
    expect(html).toContain('value="Neon &amp; &quot;Interiors&quot;"');
  });
  it('opens the shared dialog from both share entry points', () => {
    const open = vi.fn();
    const logic = new Logic();
    logic.props = { onOpenShare: open };
    logic.shareVals().openSh();
    logic.guestVals().gToShare();
    expect(open).toHaveBeenCalledTimes(2);
    expect(logic.shareVals().shOpen).toBe(false);
  });
});
describe('provider buttons', () => {
  it('uses the filled style on sign-in and sign-up', () => {
    for (const view of ['signin', 'signup']) {
      const html = renderToStaticMarkup(<ProtoAuth view={view} options={{ providers: [{ id: 'example', name: 'Example' }] }} />);
      expect(html).toContain('background:#efede8;color:#0d0d0d');
      expect(html).toContain('Example');
      expect(html).toContain('href="/privacy"');
    }
  });
});
