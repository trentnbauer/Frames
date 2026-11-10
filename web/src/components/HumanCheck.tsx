import { useEffect, useRef, useState } from 'react';

declare global { interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void } } }
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
const load = () => (loading ??= new Promise<void>((resolve, reject) => {
  if (window.turnstile) return resolve();
  const s = document.createElement('script');
  s.src = SRC; s.async = true; s.onload = () => resolve(); s.onerror = () => { loading = null; reject(new Error('The check could not be loaded.')); };
  document.head.appendChild(s);
}));

/** Cloudflare Turnstile: a short check that a person is here. `onToken` gets its answer, which the server then verifies. */
export function HumanCheck({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let id = '', gone = false;
    load().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: siteKey, theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark', callback: onToken, 'error-callback': () => setErr('The check did not work. Reload the page to try again.') });
    }).catch((e: Error) => setErr(e.message));
    return () => { gone = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div><div ref={box} aria-label="Check that you are a person" />{err && <p className="reason" role="alert">{err}</p>}</div>;
}
