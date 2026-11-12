import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProtoEditor from './proto/ProtoEditor';

describe('composition share title', () => {
  it('uses the current composition name instead of the prototype name', () => {
    for (const name of ['Neon Interiors', 'Coastal Light']) {
      const html = renderToStaticMarkup(<ProtoEditor name={name} prints={[]} order={[]} unrated={[]} share={{ active: false }} v={{ shOpen: true }} />);
      expect(html).toContain(`Share ${name}`);
      expect(html).not.toContain('Share Kitchen wall');
    }
  });
});
