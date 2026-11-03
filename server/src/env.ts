/**
 * On/off environment variables are written true or false. A few other spellings people reach for are understood too
 * (1/0, yes/no, on/off), and an empty or missing value means the default. Anything else is reported rather than guessed,
 * because a typo in a switch like AUTH_DISABLE should never silently turn it off or on.
 */
const TRUE = ['true', '1', 'yes', 'on'];
const FALSE = ['false', '0', 'no', 'off'];

export function envBool(name: string, fallback: boolean, env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUE.includes(raw)) return true;
  if (FALSE.includes(raw)) return false;
  console.warn(`${name}="${env[name]}" is not true or false: using ${fallback}.`);
  return fallback;
}
