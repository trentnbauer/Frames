import { useState } from 'react';

export type CompositionStageName = 'progress' | 'review' | 'done';
export function CompositionStage({ value, full, disabled = false, onChange }: { value: CompositionStageName; full: boolean; disabled?: boolean; onChange: (stage: CompositionStageName) => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = async (stage: CompositionStageName) => {
    setBusy(true); setError('');
    try { await onChange(stage); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="composition-stage-wrap">
    {value === 'done' ? <button type="button" className="btn outline" disabled={disabled || busy} title="Reopen this composition for editing" onClick={() => void change(full ? 'review' : 'progress')}>Edit</button> : <div className="composition-stage" role="group" aria-label="Composition stage" aria-busy={busy}>
      {(['progress', 'review', 'done'] as const).map((stage) => <button type="button" key={stage} aria-pressed={stage === value}
        disabled={disabled || busy || (stage !== 'progress' && !full)} onClick={() => { if (stage !== value) void change(stage); }}
        title={stage !== 'progress' && !full ? 'Fill every artwork slot first' : stage === 'done' ? 'Complete and lock this composition' : stage === 'review' ? 'Review this composition; editing stays available' : 'Continue designing this composition'}>
        <span aria-hidden="true" className={`stage-shape ${stage}`} />{stage === 'progress' ? 'Progress' : stage === 'review' ? 'Review' : 'Done'}
      </button>)}
    </div>}
    {error && <span role="alert" className="composition-stage-error">{error}</span>}
  </div>;
}
