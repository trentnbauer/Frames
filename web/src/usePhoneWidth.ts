import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

/** True on a phone-width screen (the same 767px line the stylesheet uses), and follows the window as it changes. */
export function usePhoneWidth(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(QUERY), f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}
