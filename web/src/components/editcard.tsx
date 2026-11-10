import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

/** Only one edit card is open at a time in a list. */
export function useOne() {
  const [open, setOpen] = useState<string | null>(null);
  return { open, set: setOpen };
}
export type One = ReturnType<typeof useOne>;

const card = { background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--hair)', padding: '18px 20px', maxWidth: 560, marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 } as const;

/**
 * One item in a list: a summary line, an Edit button on the right, and under it, when open, a card with the form.
 * `right` goes beside the button (a switch, a chip). With `noEdit` there is no button and no card.
 */
export function EditRow({ id, one, summary, right, title, note, noEdit, children }: { id: string; one: One; summary: ReactNode; right?: ReactNode; title: string; note?: string; noEdit?: boolean; children?: ReactNode }) {
  const isOpen = one.open === id;
  return (
    <div>
      <div className="srow" style={{ fontSize: 14 }}>
        <div className="srow-t" style={{ fontSize: 14 }}>{summary}</div>
        <div className="srow-c">
          {right}
          {!noEdit && <button className="ghost plain" aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Edit'} ${title}`} onClick={() => one.set(isOpen ? null : id)}>{isOpen ? 'Close' : 'Configure'}</button>}
        </div>
      </div>
      {!noEdit && isOpen && (
        <div role="group" aria-label={`Edit ${title}`} className="sdetail">
          {note && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>{note}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

/** The bottom of an edit card: the main button first, others after it, a destructive text button pushed to the right. */
export const CardFooter = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>{children}</div>;
export const Destructive = (p: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...p} className={`t2 danger ${p.className ?? ''}`} style={{ marginLeft: 'auto', ...p.style }} />;

/** A small grey tag beside a name. */
export const Chip = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 12, background: 'var(--hover)', borderRadius: 999, padding: '2px 9px', color: 'var(--text2)' }}>{children}</span>;
/** "Me" next to the current person's name. */
export const MeTag = () => <span style={{ fontSize: 11, fontWeight: 500, background: 'var(--text)', color: 'var(--bg)', borderRadius: 999, padding: '1px 8px', marginLeft: 6 }}>Me</span>;
