import type { KeyboardEvent } from 'react';

/** Enter or Space on something that is clickable but not a <button> does what a click does. */
export const keyClick = (e: KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return; // a key pressed in a field inside it is that field's
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); }
};
