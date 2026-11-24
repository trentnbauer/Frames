import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProtoMore from './proto/ProtoMore';

const todo = (extra: Record<string, unknown>) => renderToStaticMarkup(<ProtoMore page="todo" v={{ isTodo: true, tShowDesc: true, tDesc: 'A car in a lane', tCam: [], tTags: [], tNotes: [], tComps: [], ...extra }} />);

describe('To do: accept an AI description', () => {
  it('shows the suggestion with Accept and Reject, without a separate Use suggestion step', () => {
    const html = todo({ useDesc: null, tSaveLabel: 'Accept', tReject: () => {} });
    expect(html).toContain('A car in a lane');
    expect(html).toContain('>Reject</button>');
    expect(html).toContain('>Accept</span>');
    expect(html).not.toContain('Use suggestion');
  });
  it('keeps Save & next and Use suggestion for a description the person writes', () => {
    const html = todo({ useDesc: () => {} });
    expect(html).toContain('Save &amp; next');
    expect(html).toContain('Use suggestion');
    expect(html).not.toContain('>Reject</button>');
  });
});
