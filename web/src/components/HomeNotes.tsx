import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../api';

/** A free-text notes block at the bottom of Home: what to print, what to shoot next. Saves as you type, one set per person. */
export function HomeNotes() {
  const saved = useApi<{ text: string }>('/home/notes');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const loaded = useRef(false);
  const timer = useRef(0);
  useEffect(() => { if (saved.data && !loaded.current) { loaded.current = true; setText(saved.data.text); } }, [saved.data]);
  const save = (value: string) => {
    window.clearTimeout(timer.current);
    setState('saving');
    timer.current = window.setTimeout(() => {
      api('/home/notes', { method: 'PUT', body: { text: value } }).then(() => setState('saved')).catch(() => setState('error'));
    }, 600);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!saved.data && !saved.error) return null;
  return (
    <section aria-label="Notes" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="eyebrow">Notes</span>
        <span role="status" style={{ fontSize: 12.5, color: state === 'error' ? 'var(--err)' : 'var(--faint)' }}>{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save' : ''}</span>
      </div>
      <textarea className="field-in" aria-label="Notes" rows={4} maxLength={5000} value={text} placeholder="Jot down what to print, shoot or sort next. Only you see this."
        onChange={(e) => { setText(e.target.value); save(e.target.value); }} style={{ resize: 'vertical', minHeight: 96 }} />
    </section>
  );
}
