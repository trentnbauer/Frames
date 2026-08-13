import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { Tag, VisionProviderProfile, VisionProviderType } from '../types.js';
import { applyAccent, applyTheme, DEFAULT_ACCENT, getStoredAccent, getStoredTheme, type Theme } from '../theme.js';
import {
  configReady,
  getDropboxConfig,
  getGoogleDriveConfig,
  getSocialHandles,
  setDropboxConfig,
  setGoogleDriveConfig,
  setSocialHandles,
  type DropboxConfig,
  type GoogleDriveConfig,
} from '../importConfig.js';
import { useToast } from '../toast.js';

const TYPE_LABELS: Record<VisionProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  self_hosted: 'Self-hosted',
};

export function Settings() {
  const [providers, setProviders] = useState<VisionProviderProfile[]>([]);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [accent, setAccent] = useState<string>(() => getStoredAccent());
  const showToast = useToast();

  async function refresh() {
    const res = await api.visionProviders.list();
    setProviders(res.providers);
  }

  useEffect(() => {
    refresh();
  }, []);

  function setThemeAndApply(next: Theme) {
    applyTheme(next);
    setTheme(next);
  }

  function setAccentAndApply(next: string) {
    applyAccent(next);
    setAccent(next);
  }

  async function toggle(p: VisionProviderProfile) {
    await api.visionProviders.update(p.id, { enabled: !p.enabled });
    await refresh();
  }

  async function remove(p: VisionProviderProfile) {
    if (!confirm(`Remove provider "${p.name}"?`)) return;
    await api.visionProviders.remove(p.id);
    await refresh();
    showToast(`Removed "${p.name}"`);
  }

  const enabledCount = providers.filter((p) => p.enabled).length;

  return (
    <div className="settings-page">
      <h1 className="page-title">Settings</h1>

      <div className="settings-section-label" style={{ marginTop: 8 }}>Appearance</div>
      <div className="appearance-row">
        <div>
          <div className="appearance-row__title">Theme</div>
          <div className="appearance-row__sub">
            {theme === 'dark' ? 'Dark — matches the app default' : 'Light — muted, high-contrast surfaces'}
          </div>
        </div>
        <div className="segmented">
          <span className={`segmented__opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => setThemeAndApply('dark')}>Dark</span>
          <span className={`segmented__opt ${theme === 'light' ? 'active' : ''}`} onClick={() => setThemeAndApply('light')}>Light</span>
        </div>
      </div>

      <div className="appearance-row" style={{ marginTop: 8 }}>
        <div>
          <div className="appearance-row__title">Accent color</div>
          <div className="appearance-row__sub">Used for buttons, active states, and the suggested-project banner.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {accent !== DEFAULT_ACCENT && (
            <span className="link-button" style={{ marginLeft: 0, cursor: 'pointer' }} onClick={() => setAccentAndApply(DEFAULT_ACCENT)}>
              Reset
            </span>
          )}
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccentAndApply(e.target.value)}
            style={{ width: 40, height: 32, padding: 2, border: 'none', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer' }}
          />
        </div>
      </div>

      <div className="settings-section-label" style={{ marginTop: 24 }}>Tags</div>
      <p className="muted">
        Rename a tag, merge two that mean the same thing, or delete one entirely — changes apply everywhere the
        tag is used across the library.
      </p>
      <TagManagementSection />

      <div className="settings-section-label" style={{ marginTop: 24 }}>Import sources</div>
      <p className="muted">
        Google Drive and Dropbox use their own file pickers — Frames never sees your account credentials, only the
        photos you pick. Needs a free app registration on each service's developer console (below).
      </p>
      <ImportSourcesForm />

      <div className="settings-section-label" style={{ marginTop: 24 }}>Auto-import</div>
      <WatchFolderStatus />

      <div className="settings-section-label" style={{ marginTop: 24 }}>Social handles</div>
      <p className="muted">
        Shown in the bottom-left corner of a zine's back cover when you tick "Show social handles" there —
        never forced on. One per line, e.g. <code>@yourhandle</code> or <code>yoursite.com</code>.
      </p>
      <SocialHandlesForm />

      <h3>Vision auto-tagging</h3>
      <p className="muted">
        Bring your own keys, or point at a self-hosted model — Ollama, LM Studio, llama.cpp server, anything
        speaking the OpenAI-compatible chat API. Every provider you switch <strong>on</strong> runs against each
        photo on ingest; their tag suggestions merge together. Run one, or run four — that's up to you.
      </p>

      {enabledCount === 0 && providers.length > 0 && (
        <p className="muted">No providers enabled — uploads will skip auto-tagging.</p>
      )}

      <div className="provider-list">
        {providers.map((p) => (
          <ProviderRow key={p.id} provider={p} onToggle={() => toggle(p)} onSaved={refresh} onRemove={() => remove(p)} />
        ))}
      </div>

      <NewProviderForm onCreated={refresh} />

      <div className="settings-section-label" style={{ marginTop: 24 }}>Backup</div>
      <BackupSection />
    </div>
  );
}

function BackupSection() {
  const [importing, setImporting] = useState(false);
  const showToast = useToast();

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const ok = confirm(
      'This replaces your entire photo library and database with the contents of this backup file. ' +
        'Your current data is moved aside (not deleted) as a safety net, but everything added since this ' +
        'backup was made will be gone from the app. The server will restart. Continue?'
    );
    if (!ok) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('backup', file);
      const res = await fetch('/api/backup/import', { method: 'POST', body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Import failed: ${res.status}`);
      showToast(body.message || 'Restored — reload in a few seconds.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed');
      setImporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
      <p className="muted">
        Export a full snapshot of your database and photo library as a zip, or restore from one. Restoring
        replaces everything currently in Frames.
      </p>
      <div className="backup-actions">
        <button type="button" onClick={() => (window.location.href = '/api/backup/export')}>
          Export backup
        </button>
        <label className="file-button">
          {importing ? 'Restoring…' : 'Import backup'}
          <input type="file" accept=".zip" onChange={handleImport} disabled={importing} style={{ display: 'none' }} />
        </label>
      </div>
    </div>
  );
}

// Classic edit-distance DP — fine at personal-library tag-list sizes (low
// hundreds at most), run client-side against the already-fetched tag list.
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

// Case differences already collapse via slug (see types.ts#slugify), so
// only distinct names — near-typos ("portrat"), plurals ("portraits" vs
// "portrait"), or short edit distances — are worth flagging here.
function findDuplicateCandidates(tags: Tag[]): [Tag, Tag][] {
  const pairs: [Tag, Tag][] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i].name.toLowerCase();
      const b = tags[j].name.toLowerCase();
      if (a === b) continue;
      const isPlural = a === `${b}s` || b === `${a}s`;
      if (isPlural || levenshtein(a, b) <= 2) pairs.push([tags[i], tags[j]]);
    }
  }
  return pairs;
}

function TagManagementSection() {
  const [tags, setTags] = useState<Tag[]>([]);
  const showToast = useToast();

  async function refresh() {
    setTags((await api.tags.list()).tags);
  }

  useEffect(() => {
    refresh();
  }, []);

  const duplicateCandidates = findDuplicateCandidates(tags);

  async function rename(tag: Tag, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === tag.name) return;
    try {
      await api.tags.rename(tag.id, trimmed);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rename failed');
      await refresh();
    }
  }

  async function mergeInto(tag: Tag, intoId: number) {
    const into = tags.find((t) => t.id === intoId);
    if (!into) return;
    if (!confirm(`Merge "${tag.name}" into "${into.name}"? This can't be undone.`)) return;
    await api.tags.merge(tag.id, intoId);
    showToast(`Merged "${tag.name}" into "${into.name}"`);
    await refresh();
  }

  async function remove(tag: Tag) {
    if (!confirm(`Delete tag "${tag.name}" from all ${tag.photo_count} photo${tag.photo_count === 1 ? '' : 's'}? This can't be undone.`)) return;
    await api.tags.remove(tag.id);
    showToast(`Deleted "${tag.name}"`);
    await refresh();
  }

  return (
    <div>
      {duplicateCandidates.length > 0 && (
        <div className="tag-duplicates">
          {duplicateCandidates.map(([a, b]) => {
            const [winner, loser] = a.photo_count >= b.photo_count ? [a, b] : [b, a];
            return (
              <div key={`${a.id}-${b.id}`} className="tag-duplicates__row">
                <span className="tag-duplicates__names">Possible duplicate: <strong>{a.name}</strong> ↔ <strong>{b.name}</strong></span>
                <button onClick={() => mergeInto(loser, winner.id)}>Merge into "{winner.name}"</button>
              </div>
            );
          })}
        </div>
      )}
      <div className="tag-manage-list">
        {tags.map((tag) => (
          <div key={tag.id} className="tag-manage-row">
            <input className="field-input" defaultValue={tag.name} onBlur={(e) => rename(tag, e.target.value)} />
            <span className="muted tag-manage-row__count">{tag.photo_count} photo{tag.photo_count === 1 ? '' : 's'}</span>
            <select value="" onChange={(e) => e.target.value && mergeInto(tag, Number(e.target.value))}>
              <option value="">Merge into…</option>
              {tags.filter((t) => t.id !== tag.id).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button className="danger" onClick={() => remove(tag)}>Delete</button>
          </div>
        ))}
        {tags.length === 0 && <p className="muted">No tags yet.</p>}
      </div>
    </div>
  );
}

function WatchFolderStatus() {
  const [watchFolder, setWatchFolder] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    api.config.get().then((c) => setWatchFolder(c.watchFolder));
  }, []);

  return (
    <p className="muted">
      {watchFolder === undefined ? (
        'Checking…'
      ) : watchFolder ? (
        <>Watching <code>{watchFolder}</code> — image files dropped there are imported automatically.</>
      ) : (
        <>
          Not configured. Set the <code>FRAMES_WATCH_DIR</code> environment variable to a folder (e.g. a phone-sync
          or scanner output directory) to have Frames import new files from it automatically.
        </>
      )}
    </p>
  );
}

function ProviderRow({
  provider,
  onToggle,
  onSaved,
  onRemove,
}: {
  provider: VisionProviderProfile;
  onToggle: () => void;
  onSaved: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.base_url ?? '');
  const [model, setModel] = useState(provider.model ?? '');
  const [apiKey, setApiKey] = useState('');

  async function save() {
    await api.visionProviders.update(provider.id, {
      name,
      base_url: baseUrl || undefined,
      model: model || undefined,
      api_key: apiKey || undefined,
    });
    setApiKey('');
    setEditing(false);
    onSaved();
  }

  return (
    <div className={`provider-row ${provider.enabled ? 'is-enabled' : ''}`}>
      <div className="provider-row__head">
        <label className="toggle">
          <input type="checkbox" checked={provider.enabled} onChange={onToggle} />
          <span />
        </label>
        <span className="provider-row__name">{provider.name}</span>
        <span className="provider-row__type">{TYPE_LABELS[provider.type]}</span>
        <span className="muted">{provider.model || 'default model'}</span>
        <button className="link-button" onClick={() => setEditing((e) => !e)}>{editing ? 'Close' : 'Edit'}</button>
        <button className="danger" onClick={onRemove}>Remove</button>
      </div>

      {editing && (
        <div className="provider-row__edit">
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {provider.type === 'self_hosted' && (
            <label>
              Base URL
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            </label>
          )}
          <label>
            Model override
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="defaults per provider" />
          </label>
          <label>
            API key {provider.hasApiKey && <span className="muted">(set — leave blank to keep it)</span>}
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={provider.type === 'self_hosted' ? 'optional' : 'sk-…'} />
          </label>
          <button onClick={save}>Save</button>
        </div>
      )}
    </div>
  );
}

function ImportSourcesForm() {
  const [google, setGoogle] = useState<GoogleDriveConfig>(() => getGoogleDriveConfig());
  const [dropbox, setDropbox] = useState<DropboxConfig>(() => getDropboxConfig());
  const [saved, setSaved] = useState<'google' | 'dropbox' | null>(null);

  function saveGoogle() {
    setGoogleDriveConfig(google);
    setSaved('google');
    setTimeout(() => setSaved(null), 1500);
  }

  function saveDropbox() {
    setDropboxConfig(dropbox);
    setSaved('dropbox');
    setTimeout(() => setSaved(null), 1500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
      <div className="new-provider-form">
        <h4>Google Drive</h4>
        <label>
          API key
          <input value={google.apiKey} onChange={(e) => setGoogle({ ...google, apiKey: e.target.value })} placeholder="from Google Cloud Console" />
        </label>
        <label>
          OAuth client ID
          <input value={google.clientId} onChange={(e) => setGoogle({ ...google, clientId: e.target.value })} placeholder="xxxxx.apps.googleusercontent.com" />
        </label>
        <button onClick={saveGoogle}>Save</button>
        {saved === 'google' && <span className="muted"> Saved.</span>}
      </div>

      <div className="new-provider-form">
        <h4>Dropbox</h4>
        <label>
          App key
          <input value={dropbox.appKey} onChange={(e) => setDropbox({ appKey: e.target.value })} placeholder="from Dropbox App Console" />
        </label>
        <button onClick={saveDropbox}>Save</button>
        {saved === 'dropbox' && <span className="muted"> Saved.</span>}
      </div>
    </div>
  );
}

function SocialHandlesForm() {
  const [text, setText] = useState(() => getSocialHandles().join('\n'));
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    configReady.then(() => {
      if (!touched) setText(getSocialHandles().join('\n'));
    });
  }, [touched]);

  function save() {
    const handles = text.split('\n').map((h) => h.trim()).filter(Boolean);
    setSocialHandles(handles);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="new-provider-form" style={{ marginBottom: 8 }}>
      <label>
        Handles
        <textarea
          value={text}
          onChange={(e) => {
            setTouched(true);
            setText(e.target.value);
          }}
          placeholder={'@yourhandle\nyoursite.com'}
          rows={3}
          style={{ fontFamily: 'inherit', resize: 'vertical' }}
        />
      </label>
      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved.</span>}
    </div>
  );
}

function NewProviderForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<VisionProviderType>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const showToast = useToast();

  async function create() {
    if (!name.trim()) return;
    if (type === 'self_hosted' && !baseUrl.trim()) return;

    await api.visionProviders.create({
      name: name.trim(),
      type,
      base_url: baseUrl || undefined,
      model: model || undefined,
      api_key: apiKey || undefined,
      enabled: true,
    });

    showToast(`Added "${name.trim()}"`);
    setName('');
    setBaseUrl('');
    setModel('');
    setApiKey('');
    onCreated();
  }

  return (
    <div className="new-provider-form">
      <h4>Add a provider</h4>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder='e.g. "Local Ollama llava"' />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as VisionProviderType)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
          <option value="self_hosted">Self-hosted / other (OpenAI-compatible)</option>
        </select>
      </label>
      {type === 'self_hosted' && (
        <label>
          Base URL
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
        </label>
      )}
      <label>
        Model override (optional)
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="defaults per provider" />
      </label>
      <label>
        API key {type === 'self_hosted' && <span className="muted">(usually not needed)</span>}
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
      </label>
      <button onClick={create}>Add provider</button>
    </div>
  );
}
