import { useSyncExternalStore, useState } from 'react';
import { Modal } from './Modal';
import { WarningIcon } from './WarningIcon';
export type DialogOptions = { title?: string; confirm?: string; danger?: boolean };
type Request = { id: number; message: string; value?: string; opts?: DialogOptions; resolve: (value: string | boolean | null) => void };
let sequence = 0;
let current: Request | null = null;
const queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function request(message: string, value?: string, opts?: DialogOptions) {
  return new Promise<string | boolean | null>((resolve) => {
    const next = { id: ++sequence, message, value, opts, resolve };
    if (current) queue.push(next); else { current = next; emit(); }
  });
}
/** A question for a title and a verb for the button. Without options the first line becomes the title when it is a question, and a message that removes or deletes something is drawn as a danger confirm. */
export async function confirmAction(message: string, opts?: DialogOptions): Promise<boolean> { return await request(message, undefined, opts) === true; }
export async function promptAction(message: string, value = '', opts?: DialogOptions): Promise<string | null> { return await request(message, value, opts) as string | null; }
const verbOf = (m: string) => /^(Delete|Remove|Reset|Take)\b/.exec(m)?.[1];
function finish(value: string | boolean | null) { const done = current; current = queue.shift() ?? null; emit(); done?.resolve(value); }
function Dialog({ item }: { item: Request }) {
  const [value, setValue] = useState(item.value ?? '');
  const input = item.value !== undefined;
  const [first, ...rest] = item.message.split('\n\n');
  const asked = !input && first.endsWith('?');
  const title = item.opts?.title ?? (input ? 'Enter a value' : asked ? first : 'Are you sure?');
  const body = item.opts?.title || !asked ? item.message : rest.join('\n\n');
  const verb = verbOf(item.message);
  const danger = item.opts?.danger ?? (!input && !!verb);
  const label = item.opts?.confirm ?? (input ? 'Save' : verb === 'Take' ? 'Remove' : verb ?? 'Confirm');
  const cancel = () => finish(input ? null : false);
  return <Modal title={title} onClose={cancel} foot={<><button className="btn" onClick={cancel}>Cancel</button><button className={danger ? 'btn danger' : 'btn primary'} onClick={() => finish(input ? value : true)}>{danger && <WarningIcon />}{label}</button></>}>{body && <p style={{ whiteSpace: 'pre-wrap' }}>{body}</p>}{input && <input className="field-in" aria-label={item.message} autoFocus value={value} onChange={(event) => setValue(event.target.value)} />}</Modal>;
}
export function DialogHost() {
  const item = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
  return item ? <Dialog key={item.id} item={item} /> : null;
}
