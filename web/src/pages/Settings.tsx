import { useEffect, useState } from 'react';
import { api } from '../api.js';
import type { VisionProviderProfile, VisionProviderType } from '../types.js';
import { applyAccent, applyTheme, DEFAULT_ACCENT, getStoredAccent, getStoredTheme, type Theme } from '../theme.js';

const TYPE_LABELS: Record<VisionProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  self_hosted: 'Self-hosted',
};

export function Settings() {
  const [providers, setProviders] = useState<VisionProviderProfile[]>([]);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [accent, setAccent] = useState<string>(() => getStoredAccent());

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
    </div>
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

function NewProviderForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<VisionProviderType>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

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
          <option value="self_hosted">Self-hosted (OpenAI-compatible)</option>
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
