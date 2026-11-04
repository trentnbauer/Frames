import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../api';
import { buildEnv, FIELDS, GROUPS, problems, type Values } from '../envFile';

type Info = { values: Record<string, string>; version: string; hasPassword: boolean; oauthProviders: number; tunnelManagedByEnv: boolean };

/**
 * Run Frames with no variables at all, set it up here, then take the result away as a .env file for the stack.
 * The file is built in this browser: the secrets typed here (API token, password) are never sent to the server or stored.
 */
export function Deployment() {
  const d = useApi<Info>('/admin/deployment');
  const [v, setV] = useState<Values>({});
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (d.data) setV((cur) => (Object.keys(cur).length ? cur : d.data!.values)); }, [d.data]);
  const date = useMemo(() => new Date(), []);
  const issues = useMemo(() => problems(v), [v]);
  if (!d.data) return <p className="empty">Loading…</p>;
  const info = d.data;
  const set = (k: string, val: string) => { setV({ ...v, [k]: val }); setCopied(false); };
  const file = () => buildEnv(v, { version: info.version === 'dev' ? undefined : info.version, date });
  const shown = buildEnv(v, { mask: !reveal, version: info.version === 'dev' ? undefined : info.version, date });
  const download = () => {
    const url = URL.createObjectURL(new Blob([file()], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'frames.env'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(file()); setCopied(true); } catch { /* the download still works */ } };

  return (
    <>
      <p>Frames starts with no variables at all and every other setting lives in the app. When you are happy, fill this in and take the result away as a <span className="mono">.env</span> file for your Docker stack. It starts from how this server is set up now. <b>The file is built in your browser: the secrets you type here are never sent to the server or stored.</b></p>
      {info.hasPassword && <div className="banner"><span>A shared password is in use. A password cannot be read back, so type it again below if you want it in the file.</span></div>}
      {info.oauthProviders > 0 && <div className="banner"><span>Sign-in providers, the allow-list, people, AI settings and cloud accounts are kept in Frames’ data volume, not in this file, so they carry over by keeping the same volume.</span></div>}
      {info.tunnelManagedByEnv && <div className="banner"><span>The tunnel is already set up from environment variables. Its API token cannot be read back: paste it again to keep it in the file.</span></div>}

      {GROUPS.map((g) => (
        <div className="field" key={g}>
          <h3>{g}</h3>
          <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12, maxWidth: 560 }}>
            {FIELDS.filter((f) => f.group === g).map((f) => (
              <div key={f.key}>
                {f.kind === 'bool' ? (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" aria-label={f.label} checked={v[f.key] === 'true'} onChange={(e) => set(f.key, e.target.checked ? 'true' : 'false')} />
                    <span>{f.label} <span className="mono faint">{f.key}</span></span>
                  </label>
                ) : (
                  <label style={{ display: 'block' }}>{f.label} <span className="mono faint">{f.key}</span>
                    <input type={f.kind === 'secret' ? 'password' : 'text'} autoComplete="off" aria-label={f.label} value={v[f.key] ?? ''} placeholder={f.placeholder ?? ''} onChange={(e) => set(f.key, e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4 }} />
                  </label>
                )}
                <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0' }}>{f.help}{f.link && <> <a href={f.link.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{f.link.text}</a>.</>}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="field">
        <h3>Your .env file</h3>
        {issues.length > 0 && <ul role="alert" className="reason" style={{ margin: '0 0 10px', paddingLeft: 20 }}>{issues.map((m) => <li key={m}>{m}</li>)}</ul>}
        <pre className="mono" aria-label="Preview of the .env file" style={{ fontSize: 12, background: 'var(--surface)', borderRadius: 8, padding: 14, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{shown}</pre>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <button className="pill primary" onClick={download}>Download frames.env</button>
          <button className="pill" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> Show secrets in the preview</label>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>With Docker Compose: <span className="mono">docker compose --env-file frames.env up -d</span>, or rename it to <span className="mono">.env</span> next to your compose file. With Portainer: Stack, Environment variables, <i>Load variables from .env file</i>. The file holds secrets, so keep it private and never commit it. Frames {info.version === 'dev' ? 'is a development build' : `${info.version}`}.</p>
      </div>
    </>
  );
}
