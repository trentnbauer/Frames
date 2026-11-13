import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PasswordSignIn } from './components/AccountPassword';
import ProtoAuth from './proto/ProtoAuth';

it('provides labelled password-manager fields and a real form using theme tokens', () => {
  const html = renderToStaticMarkup(<PasswordSignIn serverName="Frames" returnTo="/library" onBack={() => {}} />);
  expect(html).toContain('<form');
  expect(html).toContain('autoComplete="username"');
  expect(html).toContain('autoComplete="current-password"');
  expect(html).toContain('type="password"');
  expect(html).toContain('type="submit"');
  expect(html).toContain('Other sign-in methods');
  expect(html).not.toMatch(/#[a-f0-9]{3,8}/i);
});
it('offers the personal password action on the sign-in screen', () => {
  const html = renderToStaticMarkup(<ProtoAuth view="signin" options={{providers:[]}} personalPassword={<button>Sign in with a password</button>} />);
  expect(html).toContain('<button>Sign in with a password</button>');
});
it('does not advertise the legacy shared password when only personal/provider methods are available', () => {
  const html = renderToStaticMarkup(<ProtoAuth view="signin" options={{providers:[{id:'github',name:'GitHub'}],signups:true,password:false}} />);
  expect(html).not.toContain('Use the shared password instead');
  expect(html).toContain('Create an account');
});
