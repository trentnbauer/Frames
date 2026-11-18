import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FolderPicker } from './FolderPicker';

vi.mock('../api', () => ({ api: vi.fn(() => new Promise(() => {})) }));

describe('the cloud folder picker', () => {
  it('lists the folders already chosen under “Will be copied” and counts them', () => {
    const html = renderToStaticMarkup(<FolderPicker connId="c1" provider="google" label="Google Drive" account="someone@example.test" chosen={[{ id: 'f1', name: 'Weddings' }, { id: 'f2', name: 'Portfolio' }]} onClose={() => {}} onDone={() => {}} />);
    for (const text of ['Choose folders', 'Google Drive · someone@example.test', 'Will be copied', 'Weddings', 'Portfolio', '2 folders chosen', 'Everything in this account', 'Loading…']) expect(html).toContain(text);
  });
  it('names a whole-account choice as Everything, using each service’s own top-level id', () => {
    for (const [provider, root] of [['google', 'root'], ['dropbox', ''], ['onedrive', 'root']]) {
      const html = renderToStaticMarkup(<FolderPicker connId="c1" provider={provider} label="X" chosen={[{ id: root, name: '' }]} onClose={() => {}} onDone={() => {}} />);
      expect(html).toContain('Whole account');
      expect(html).toContain('1 folder chosen');
    }
  });
  it('says so when nothing is chosen yet', () => {
    const html = renderToStaticMarkup(<FolderPicker connId="c1" provider="dropbox" label="Dropbox" chosen={[]} onClose={() => {}} onDone={() => {}} />);
    expect(html).toContain('Nothing chosen yet');
  });
});
