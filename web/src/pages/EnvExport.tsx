import { useApi } from '../api';

type Row = { name: string; secret: boolean; status: 'same' | 'differs' | 'app only' | 'env only'; env?: string; app?: string };
type Compare = { rows: Row[]; counts: { same: number; differs: number; appOnly: number; envOnly: number } };

type Info = { allowed: boolean; loaded: { system: boolean; owner: boolean }; settings: { system: number; owner: number }; version: string };

/**
 * Set Frames up in the app with next to no variables, then take everything away as one env file for the stack: the settings,
 * the AI keys, the cloud accounts, the tunnel token. Once that file is the stack's env it wins over the app, and the export is
 * switched off so the secrets cannot be downloaded a second time.
 */
export function EnvExport() {
  const d = useApi<Info>('/admin/env');
  const cmp = useApi<Compare>('/admin/env/compare');
  if (!d.data) return <p className="empty">Loading…</p>;
  const i = d.data;
  const loaded = i.loaded.system || i.loaded.owner;
  return (
    <>
      <p>Everything you set up in the app can be taken away as a single <span className="mono">frames.env</span> file for your Docker stack: sign-in, the Cloudflare tunnel, AI sources and their keys, cloud accounts, your portfolio and review settings, and any variables Frames was started with. <b>It holds every secret, so keep it private and never commit it.</b></p>

      <div className="field">
        <h3>Download</h3>
        {i.allowed ? (
          <>
            <p>{i.settings.system + i.settings.owner} saved server settings will be written to the file: sign-in, the tunnel, the privacy page, cloud storage providers and the AIs for everyone. The file switches the export off again (<span className="mono">ALLOW_ENV_EXPORT=false</span>), so once you use it the secrets cannot be downloaded a second time.</p>
            <a className="pill primary" href="/api/admin/env/export" download="frames.env">Download frames.env</a>
          </>
        ) : (
          <div className="banner" role="status"><span>Export is switched off (<span className="mono">ALLOW_ENV_EXPORT=false</span>). That is what the exported file sets, so the secrets cannot be downloaded again. To export again, set it to <span className="mono">true</span> in your env file and restart Frames.</span></div>
        )}
      </div>

      <div className="field">
        <h3>Using it</h3>
        <ol className="muted" style={{ fontSize: 13.5, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>Add the file to your stack: <span className="mono">docker compose --env-file frames.env up -d</span>, or save it as <span className="mono">.env</span> next to your compose file, or in Portainer use <i>Stack, Environment variables, Load variables from .env file</i>.</li>
          <li>Make sure the compose file reads the file with <span className="mono">env_file:</span>, so every setting reaches Frames as its own variable (like <span className="mono">AI_1_KEY</span> or <span className="mono">AUTH_ALLOW</span>). The compose files in this repository already do.</li>
          <li>Restart Frames. The file now <b>wins over the app</b>: its values are written over what was saved every time Frames starts.</li>
        </ol>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Only the server’s settings are in the file. Everyone’s own library, the owner’s included (their AIs, cloud folders, portfolio, review settings), and the photographs, previews and compositions stay in the data volume: keep using the same volume. Sign-in sessions are not in the file, so everyone signs in again after a move.</p>
      </div>

      <div className="field">
        <h3>Saved in the app against set in the environment</h3>
        <p className="muted" style={{ fontSize: 13 }}>For each variable the file would hold: what this container was started with, and, where the app has something different saved, what that is. Secrets (keys, tokens, passwords) are never shown, only whether they are set.</p>
        {cmp.data && (
          <>
            <p style={{ fontSize: 13 }}>{cmp.data.counts.same} the same · {cmp.data.counts.differs} different · {cmp.data.counts.appOnly} saved in the app only · {cmp.data.counts.envOnly} set in the environment only</p>
            {cmp.data.rows.length === 0 && <p className="muted">Nothing is saved yet.</p>}
            {cmp.data.rows.length > 0 && (
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: '4px 8px 4px 0' }}>Variable</th><th style={{ padding: '4px 8px' }}>Set in the environment</th><th style={{ padding: '4px 8px' }}>Saved in the app</th><th>Status</th></tr></thead>
                <tbody>
                  {cmp.data.rows.map((r) => {
                    const secretCell = (set: boolean) => <span className="faint">{set ? '•••• secret, set' : '–'}</span>;
                    const val = (v: string | undefined) => (v === undefined ? <span className="faint">–</span> : <span className="mono" style={{ wordBreak: 'break-all' }}>{v === '' ? <span className="faint">(empty)</span> : v}</span>);
                    return (
                      <tr key={r.name} style={{ borderTop: '1px solid rgba(255,255,255,.08)', verticalAlign: 'top' }}>
                        <td className="mono" style={{ padding: '6px 8px 6px 0', wordBreak: 'break-all' }}>{r.name}</td>
                        <td style={{ padding: '6px 8px' }}>{r.secret ? secretCell(r.status !== 'app only') : r.status === 'app only' ? <span className="faint">not set</span> : val(r.env)}</td>
                        <td style={{ padding: '6px 8px' }}>{r.secret ? secretCell(r.status !== 'env only') : r.status === 'same' ? <span className="faint">same</span> : r.status === 'env only' ? <span className="faint">not saved</span> : val(r.app)}</td>
                        <td className={r.status === 'differs' ? 'reason' : r.status === 'same' ? '' : 'muted'} style={{ padding: '6px 0' }}>{r.status === 'same' ? 'Same' : r.status === 'differs' ? 'Different' : r.status === 'app only' ? 'App only' : 'Environment only'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="field">
        <h3>Status</h3>
        <p style={{ margin: 0 }}>{loaded ? <>Settings were loaded from an env file when Frames started. Changes you make in the app last until the next restart; to keep them, set <span className="mono">ALLOW_ENV_EXPORT=true</span>, restart, and export a new file.</> : 'Frames is running from the settings saved in the app. No env file is loaded.'}</p>
      </div>
    </>
  );
}
