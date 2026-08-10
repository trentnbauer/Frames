import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import type { Photo, ShootOptions } from '../types.js';
import { pickFromDropbox, pickFromGoogleDrive } from '../importSources.js';

const EMPTY_OPTIONS: ShootOptions = { camera: [], lens: [], film_stock: [], location: [], photoshoot: [] };

export function Import() {
  const [batch, setBatch] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<ShootOptions>(EMPTY_OPTIONS);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [newTagValues, setNewTagValues] = useState<Record<number, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  async function refreshOptions() {
    const [shoot, tags] = await Promise.all([api.photos.shootOptions(), api.tags.list()]);
    setOptions(shoot);
    setTagOptions(tags.tags.map((t) => t.name));
  }

  useEffect(() => {
    refreshOptions();
  }, []);

  // Poll rows still auto-tagging so suggested tags appear without a manual refresh.
  useEffect(() => {
    const pendingIds = batch.filter((p) => p.tagging_status === 'pending').map((p) => p.id);
    if (pendingIds.length === 0) return;
    const timer = setInterval(async () => {
      const updated = await Promise.all(pendingIds.map((id) => api.photos.get(id).then((r) => r.photo)));
      setBatch((prev) => prev.map((p) => updated.find((u) => u.id === p.id) ?? p));
    }, 2500);
    return () => clearInterval(timer);
  }, [batch]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const res = await api.photos.upload(Array.from(files));
      setBatch((prev) => [...prev, ...res.results.map((r) => r.photo)]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function importFrom(source: 'google' | 'dropbox') {
    try {
      const files = source === 'google' ? await pickFromGoogleDrive() : await pickFromDropbox();
      await handleFiles(files);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function refreshRow(id: number) {
    const { photo } = await api.photos.get(id);
    setBatch((prev) => prev.map((p) => (p.id === id ? photo : p)));
  }

  async function removeTag(photo: Photo, tagId: number) {
    await api.photos.removeTag(photo.id, tagId);
    await refreshRow(photo.id);
  }

  async function addNewTag(photo: Photo) {
    const value = (newTagValues[photo.id] ?? '').trim();
    if (!value) return;
    await api.photos.addTag(photo.id, value, 'user_added');
    setNewTagValues((prev) => ({ ...prev, [photo.id]: '' }));
    await refreshRow(photo.id);
    await refreshOptions();
  }

  async function updateField(photo: Photo, field: 'camera' | 'lens' | 'film_stock' | 'location' | 'photoshoot', value: string) {
    if (value === (photo[field] ?? '')) return;
    await api.photos.update(photo.id, { [field]: value });
    await refreshRow(photo.id);
    await refreshOptions();
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Import Photos</h1>
          <div className="page-subtitle">Drop files in, then review the tags Frames suggests before they join a project.</div>
        </div>
        <div className="page-header__actions">
          <button className="btn" onClick={() => importFrom('google')}>Import from Google Drive</button>
          <button className="btn" onClick={() => importFrom('dropbox')}>Import from Dropbox</button>
        </div>
      </div>

      <datalist id="tag-options-list">{tagOptions.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="camera-options-list">{options.camera.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="lens-options-list">{options.lens.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="film-options-list">{options.film_stock.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="location-options-list">{options.location.map((o) => <option key={o} value={o} />)}</datalist>
      <datalist id="photoshoot-options-list">{options.photoshoot.map((o) => <option key={o} value={o} />)}</datalist>

      {batch.length > 0 && (
        <>
          <div className="import-status-row">
            <div className="import-status-row__label">{batch.length} photo{batch.length === 1 ? '' : 's'} to review</div>
            <button className="btn" onClick={() => inputRef.current?.click()}>Add More</button>
          </div>

          <div className="import-list">
            {batch.map((photo) => (
              <div key={photo.id} className="import-row">
                <img className="import-row__thumb" src={`/files/thumb/${photo.id}`} alt={photo.filename} />
                <div className="import-row__body">
                  <div className="import-row__filename">
                    {photo.filename}{photo.tagging_status === 'pending' ? ' · tagging…' : ''}
                  </div>

                  <div className="import-row__label">Suggested tags — click to remove</div>
                  <div className="import-row__tags">
                    {photo.tags.map((t) => (
                      <span key={t.id} className="import-tag-pill active" onClick={() => removeTag(photo, t.id)}>
                        {t.name} ✕
                      </span>
                    ))}
                    <input
                      className="import-tag-input"
                      value={newTagValues[photo.id] ?? ''}
                      onChange={(e) => setNewTagValues((prev) => ({ ...prev, [photo.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addNewTag(photo)}
                      list="tag-options-list"
                      placeholder="+ add tag"
                    />
                  </div>

                  <div className="import-row__label">Shoot details — optional</div>
                  <input
                    className="field-input import-row__photoshoot"
                    defaultValue={photo.photoshoot ?? ''}
                    onBlur={(e) => updateField(photo, 'photoshoot', e.target.value)}
                    list="photoshoot-options-list"
                    placeholder="Photoshoot, e.g. Portrait of Ebony"
                  />
                  <div className="import-row__fields-grid">
                    <input className="field-input" defaultValue={photo.camera ?? ''} onBlur={(e) => updateField(photo, 'camera', e.target.value)} list="camera-options-list" placeholder="Camera model" />
                    <input className="field-input" defaultValue={photo.lens ?? ''} onBlur={(e) => updateField(photo, 'lens', e.target.value)} list="lens-options-list" placeholder="Lens" />
                    <input className="field-input" defaultValue={photo.film_stock ?? ''} onBlur={(e) => updateField(photo, 'film_stock', e.target.value)} list="film-options-list" placeholder="Film stock" />
                    <input className="field-input" defaultValue={photo.location ?? ''} onBlur={(e) => updateField(photo, 'location', e.target.value)} list="location-options-list" placeholder="Location" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        className={`dropzone-lg ${batch.length > 0 ? 'has-batch' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        <div className="dropzone-lg__icon"><div className="dropzone-lg__icon-arrow" /></div>
        <div className="dropzone-lg__title">
          {busy ? 'Uploading…' : batch.length > 0 ? 'Import more photos' : 'Drop photos to import'}
        </div>
        <div className="dropzone-lg__hint">Drag and drop, or click to choose files from your desktop</div>
      </div>
    </div>
  );
}
