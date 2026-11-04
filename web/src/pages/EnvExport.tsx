import { useApi } from '../api';

type Info = { allowed: boolean; loaded: { system: boolean; owner: boolean }; settings: { system: number; owner: number }; version: string };

/**
 * Set Frames up in the app with next to no variables, then take everything away as one env file for the stack: the settings,
 * the AI keys, the cloud accounts, the tunnel token. Once that file is the stack's env it wins over the app, and the export is
 * switched off so the secrets cannot be downloaded a second time.
 */
export function EnvExport() {
  const d = useApi<Info>('/admin/env');
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
        <h3>Status</h3>
        <p style={{ margin: 0 }}>{loaded ? <>Settings were loaded from an env file when Frames started. Changes you make in the app last until the next restart; to keep them, set <span className="mono">ALLOW_ENV_EXPORT=true</span>, restart, and export a new file.</> : 'Frames is running from the settings saved in the app. No env file is loaded.'}</p>
      </div>
    </>
  );
}
