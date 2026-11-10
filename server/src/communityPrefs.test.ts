import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { env.app.close(); cleanup(env); });

describe('community prefs', () => {
  it('stores a known share choice and refuses anything else', async () => {
    expect((await A.put('/api/community/prefs', { share: 'portfolio' })).body.share).toBe('portfolio');
    expect((await A.put('/api/community/prefs', { share: ['any'] })).status).toBe(400);
    expect((await A.put('/api/community/prefs', { share: '<b>x</b>' })).status).toBe(400);
    expect((await A.get('/api/community/prefs')).body.share).toBe('portfolio');
  });
});
