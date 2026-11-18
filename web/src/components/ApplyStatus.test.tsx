import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ApplyStatus, runApplying } from './ApplyStatus';

const shown = () => renderToStaticMarkup(<ApplyStatus />);

describe('the header’s applying-changes status', () => {
  it('shows the work and its progress while it runs, then that it is done', async () => {
    let release!: () => void;
    const run = runApplying('Applying changes to 3 photos', (progress) => { progress('1 of 3 processed'); return new Promise<void>((r) => { release = r; }); });
    expect(shown()).toContain('Applying changes to 3 photos · 1 of 3 processed');
    release();
    expect(await run).toBe(true);
    expect(shown()).toContain('Changes applied');
  });
  it('keeps the reason on show when it fails, and says it failed', async () => {
    expect(await runApplying('Applying changes', async () => { throw new Error('A selected photo changed. Preview the edits again.'); })).toBe(false);
    expect(shown()).toContain('Changes not applied: A selected photo changed');
  });
});
