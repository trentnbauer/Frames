import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TwoFactor, type MfaStatus } from './components/TwoFactor';
const state = vi.hoisted(() => ({ status: { policy: 'members', required: true, verified: false, totp: false, passkeys: 0 } as MfaStatus }));
vi.mock('./api', () => ({ api: vi.fn(), useApi: () => ({ data: state.status, reload: vi.fn() }) }));
it('offers first-time enrolment with either an authenticator or a passkey', () => {
  state.status = { policy: 'members', required: true, verified: false, totp: false, passkeys: 0 };
  const html = renderToStaticMarkup(<TwoFactor gate />);
  expect(html).toContain('Set up authenticator app'); expect(html).toContain('Add a passkey');
  expect(html).not.toContain('Verify code');
});
it('requires an existing factor instead of letting an unverified session replace it', () => {
  for (const factor of ['totp', 'passkey']) {
    state.status = { policy: 'members', required: true, verified: false, totp: factor === 'totp', passkeys: factor === 'passkey' ? 1 : 0 };
    const html = renderToStaticMarkup(<TwoFactor gate />);
    expect(html).not.toContain('Set up authenticator app'); expect(html).not.toContain('Add a passkey');
    expect(html).toContain(factor === 'totp' ? 'Authenticator or recovery code' : 'Verify with passkey');
  }
});
it('offers removal only after this session has verified a factor', () => {
  state.status = { policy: 'off', required: true, verified: true, totp: true, passkeys: 0 };
  expect(renderToStaticMarkup(<TwoFactor />)).toContain('Remove authenticator app');
  state.status.verified = false;
  expect(renderToStaticMarkup(<TwoFactor />)).not.toContain('Remove authenticator app');
});

it('lets a legacy passkey owner enrol their first verified second factor', () => {
  state.status = { policy: 'members', required: true, verified: false, enrolled: false, totp: false, passkeys: 1 };
  const html = renderToStaticMarkup(<TwoFactor gate />);
  expect(html).toContain('Set up authenticator app'); expect(html).toContain('Add a passkey'); expect(html).toContain('Verify with passkey');
});
