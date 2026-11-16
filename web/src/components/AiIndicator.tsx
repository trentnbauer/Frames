import { useEffect, useState } from 'react';
import { api } from '../api';
export type AiStatus = { enabled: boolean; running: boolean; batchRunning?: boolean; jobs?: string[]; done: number; total: number; failed?: number };
export function aiIndicatorText(status: AiStatus | null) {
  if (!status) return 'AI status unavailable';
  if (!status.running) return status.enabled ? 'AI is idle' : 'AI is off';
  if (status.batchRunning || status.jobs?.includes('describe')) return 'AI is analysing photos';
  if (status.jobs?.includes('search')) return 'AI is searching';
  if (status.jobs?.includes('ideas')) return 'AI is finding composition ideas';
  if (status.jobs?.includes('sensitive')) return 'AI is checking sensitive content';
  return 'AI is working';
}
export function AiIndicatorView({ status }: { status: AiStatus | null }) {
  const [open, setOpen] = useState(false);
  const text = aiIndicatorText(status);
  const progress = status?.running && status.batchRunning && status.total > 0;
  const done = status ? Math.max(0, Math.min(status.total, status.done)) : 0;
  return <div className="ai-indicator" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); } }}>
    <button type="button" className={'iconbtn ai-status' + (status?.running ? ' working' : '')} aria-label={text} aria-describedby={open ? 'ai-status-tooltip' : undefined} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}><span aria-hidden="true">✦</span></button>
    {open && <div id="ai-status-tooltip" role="tooltip" className="ai-status-tooltip"><div>{text}</div>{progress && <><div className="ai-status-detail">{done} of {status.total} processed{status.failed ? ` · ${status.failed} failed` : ''}</div><progress aria-label="AI photo analysis progress" value={done} max={status.total} /></>}</div>}
  </div>;
}
export function AiIndicator() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const poll = async () => {
      if (pending || !live) return;
      clearTimeout(timer);
      if (document.hidden) return;
      pending = true;
      try { const next = await api<AiStatus>('/ai/status'); if (live) setStatus(next); }
      catch { if (live) setStatus(null); }
      finally { pending = false; if (live) timer = setTimeout(poll, 2000); }
    };
    const wake = () => { if (!document.hidden) void poll(); else clearTimeout(timer); };
    void poll(); document.addEventListener('visibilitychange', wake);
    return () => { live = false; clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
  }, []);
  return <AiIndicatorView status={status} />;
}
