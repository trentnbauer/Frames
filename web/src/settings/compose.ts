import type { Group, R, Section } from './ui';

/** Helpers that build a settings page out of rows another page's hook already produced, so a row can move without being rewritten. */
export const rowMap = (s: Section) => new Map(s.groups.flatMap((g) => g.rows).map((r) => [r.id, r]));

/** The named rows, in the order asked for. A row that is not there is skipped. */
export const pick = (s: Section, ids: string[], patch: Record<string, Partial<R>> = {}): R[] => {
  const m = rowMap(s);
  return ids.flatMap((id) => { const r = m.get(id); return r ? [{ ...r, ...(patch[id] ?? {}) }] : []; });
};

/** The page's groups without the named rows (a group left empty goes too). */
export const without = (s: Section, ids: string[]): Group[] =>
  s.groups.map((g) => ({ ...g, rows: g.rows.filter((r) => !ids.includes(r.id)) })).filter((g) => g.rows.length);

/** Find a group by its title. */
export const groupOf = (s: Section, title: string): Group | undefined => s.groups.find((g) => g.title === title);

export const section = (key: string, name: string, hint: string, groups: Group[], extra: Partial<Section> = {}): Section => ({ key, name, hint, groups: groups.filter((g) => g.rows.length), ...extra });
