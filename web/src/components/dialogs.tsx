import { useSyncExternalStore, useState } from 'react';
import { Modal } from './Modal';
type Request = { id: number; message: string; value?: string; resolve: (value: string | boolean | null) => void };
let sequence = 0;
let current: Request | null = null;
const queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function request(message: string, value?: string) {
  return new Promise<string | boolean | null>((resolve) => {
    const next = { id: ++sequence, message, value, resolve };
    if (current) queue.push(next); else { current = next; emit(); }
  });
}
export async function confirmAction(message: string): Promise<boolean> { return await request(message) === true; }
export async function promptAction(message: string, value = ''): Promise<string | null> { return await request(message, value) as string | null; }
function finish(value: string | boolean | null) { const done = current; current = queue.shift() ?? null; emit(); done?.resolve(value); }
function Dialog({ item }: { item: Request }) {
  const [value, setValue] = useState(item.value ?? '');
  const input = item.value !== undefined;
  return <Modal title={input ? 'Enter a value' : 'Confirm action'} onClose={() => finish(input ? null : false)} foot={<><button className="btn outline" onClick={() => finish(input ? null : false)}>Cancel</button><button className="btn primary" onClick={() => finish(input ? value : true)}>Confirm</button></>}><p style={{ whiteSpace: 'pre-wrap' }}>{item.message}</p>{input && <input className="field-in" aria-label={item.message} autoFocus value={value} onChange={(event) => setValue(event.target.value)} />}</Modal>;
}
export function DialogHost() {
  const item = useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => current);
  return item ? <Dialog key={item.id} item={item} /> : null;
}
