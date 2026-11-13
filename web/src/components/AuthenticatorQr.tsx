import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Never send an enrolment URI to a QR service: it contains the user's authenticator secret. */
export function authenticatorQr(uri: string) {
  const qr = qrcode(0, 'M');
  qr.addData(uri, 'Byte');
  qr.make();
  return qr;
}

export function AuthenticatorQr({ uri }: { uri: string }) {
  const src = useMemo(() => authenticatorQr(uri).createDataURL(4, 16), [uri]);
  return <img src={src} alt="Scan this QR code with your authenticator app" className="authenticator-qr" />;
}
