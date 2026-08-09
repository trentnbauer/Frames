import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function Settings() {
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings.get().then((s) => {
      if (s.provider === 'openai' || s.provider === 'anthropic') setProvider(s.provider);
      if (s.model) setModel(s.model);
      setHasApiKey(s.hasApiKey);
    });
  }, []);

  async function save() {
    await api.settings.update({ provider, apiKey: apiKey || undefined, model: model || undefined });
    setApiKey('');
    setHasApiKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings-page">
      <h3>Vision auto-tagging</h3>
      <p className="muted">Bring your own API key. Frames sends each photo's display derivative for tagging.</p>

      <label>
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value as 'openai' | 'anthropic')}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>

      <label>
        API key {hasApiKey && <span className="muted">(key already set — leave blank to keep it)</span>}
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
      </label>

      <label>
        Model override (optional)
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="defaults per provider" />
      </label>

      <button onClick={save}>Save</button>
      {saved && <span className="muted"> Saved.</span>}
    </div>
  );
}
