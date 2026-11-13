import { renderToStaticMarkup } from 'react-dom/server';
import jsQR from 'jsqr';
import { expect, it } from 'vitest';
import { AuthenticatorQr, authenticatorQr } from './components/AuthenticatorQr';
const secret = Array.from({ length: 32 }, (_, index) => String.fromCharCode(65 + index % 26)).join('');
const uriFor = (account: string) => `otpauth://totp/${encodeURIComponent(`Frames:${account}`)}?secret=${secret}&issuer=Frames&algorithm=SHA1&digits=6&period=30`;
it.each(['demo@example.test', 'Renée + 写真@example.test'])('encodes the exact authenticator enrolment URI for %s in a scannable QR', (account) => {
  const uri = uriFor(account), qr = authenticatorQr(uri);
  const scale = 6, quiet = 4, count = qr.getModuleCount(), size = (count + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / scale) - quiet, col = Math.floor(x / scale) - quiet;
    const dark = row >= 0 && row < count && col >= 0 && col < count && qr.isDark(row, col);
    const index = (y * size + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = dark ? 0 : 255; pixels[index + 3] = 255;
  }
  expect(jsQR(pixels, size, size, { inversionAttempts: 'dontInvert' })?.data).toBe(uri);
});
it('renders the QR as a local image rather than sending the secret to an external service', () => {
  const html = renderToStaticMarkup(<AuthenticatorQr uri={uriFor('demo@example.test')} />);
  expect(html).toContain('src="data:image/gif;base64,');
  expect(html).toContain('alt="Scan this QR code with your authenticator app"');
  expect(html).not.toContain('src="https:');
});
