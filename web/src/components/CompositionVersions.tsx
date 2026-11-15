import { useState } from 'react';
import { api, useApi } from '../api';
import type { PhotoLite } from '../data';
import { arrange, type Layout } from '../layout';
import { Wall, type Pic } from './CompositionWall';
import { Modal } from './Modal';

type Version = {
  id: number;
  name: string;
  createdAt: string;
  links: number;
  available: boolean;
  photoIds: number[];
  layout: Layout;
  background: { w: number; h: number } | null;
};
export function CompositionVersions({
  id,
  readOnly,
  disabled,
  onChanged,
}: {
  id: number;
  readOnly: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn outline" disabled={disabled} onClick={() => setOpen(true)}>
        Arrangements
      </button>
      {open && <Arrangements id={id} readOnly={readOnly} onChanged={onChanged} onClose={() => setOpen(false)} />}
    </>
  );
}
function Arrangements({ id, readOnly, onChanged, onClose }: { id: number; readOnly: boolean; onChanged: () => void; onClose: () => void }) {
  const versions = useApi<Version[]>(`/collections/${id}/versions`),
    library = useApi<{ photos: PhotoLite[] }>('/photos');
  const [selected, setSelected] = useState<number | null>(null),
    [compare, setCompare] = useState<number | null>(null);
  const [name, setName] = useState(''),
    [rename, setRename] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const version = versions.data?.find((item) => item.id === selected) ?? versions.data?.[0];
  const other = versions.data?.find((item) => item.id === compare);
  const photos = new Map<number, Pic>(
    (library.data?.photos ?? []).map((photo) => [
      photo.id,
      { id: photo.id, title: photo.title || photo.file, w: photo.w, h: photo.h, ar: photo.w / photo.h },
    ]),
  );
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      versions.reload();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const preview = (item: Version) => {
    const prints = item.layout.mode === 'free' ? item.layout.prints : arrange(item.layout.prints, item.layout.mode);
    const scale = item.layout.bg?.mmPerPx ?? (item.background ? Math.max(3300 / item.background.w, 1800 / item.background.h) : 1);
    return (
      <section key={item.id}>
        <h3>{item.name}</h3>
        {!item.available && <p role="alert">A referenced photograph was removed. This arrangement is unavailable.</p>}
        <div className="arrangement-preview">
          {prints.length ? (
            <Wall
              prints={prints}
              mode={item.layout.mode}
              editing={false}
              locked
              sel={-1}
              photos={photos}
              over={null}
              fitRatio={1.2}
              hideLabels
              imageKind="thumb"
              stage={
                item.background
                  ? {
                      w: item.background.w * scale,
                      h: item.background.h * scale,
                      url: `/api/collections/${id}/versions/${item.id}/background`,
                    }
                  : undefined
              }
              onSelect={() => {}}
              onEdit={() => {}}
              onMoved={() => {}}
              onOver={() => {}}
              onDropPhoto={() => {}}
            />
          ) : (
            <p className="muted">No prints in this arrangement.</p>
          )}
        </div>
        <p className="muted">
          {prints.length} prints · {item.photoIds.length} candidates · {item.links} share links
        </p>
        <a className="btn outline" href={`/api/collections/${id}/versions/${item.id}/print-sheet`}>
          Download print sheet
        </a>
        <button
          className="btn outline"
          disabled={busy || !item.available}
          onClick={() =>
            void run(async () => {
              const ids = item.layout.prints
                .flatMap((print) => [print.photoId, print.stack ? print.photoId2 : null])
                .filter((photoId): photoId is number => photoId !== null);
              for (const [index, photoId] of ids.entries()) {
                const anchor = document.createElement('a');
                anchor.href = `/api/collections/${id}/versions/${item.id}/photos/${photoId}/original?n=${index + 1}&pad=${String(ids.length).length}`;
                anchor.download = '';
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            })
          }
        >
          Download originals
        </button>
      </section>
    );
  };
  return (
    <Modal
      title="Saved arrangements"
      sub="Save alternatives with their photographs, frames, crops and room background. Compare before applying."
      width={1100}
      onClose={() => !busy && onClose()}
      foot={
        <>
          <span className="grow muted">Applying saves the current wall first and preserves existing share links.</span>
          <button className="btn primary" disabled={busy} onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      {(error || versions.error || library.error) && <p role="alert">{error || versions.error || library.error}</p>}
      <fieldset disabled={busy} className="share-fields">
        <div className="workflow-shortcuts">
          <label>
            Save current wall
            <input
              className="field-in"
              aria-label="Arrangement name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Three across"
            />
          </label>
          <button
            className="btn outline"
            disabled={!name.trim()}
            onClick={() =>
              void run(async () => {
                const saved = await api<{ id: number }>(`/collections/${id}/versions`, { body: { name } });
                setSelected(saved.id);
                setRename(name);
                setName('');
              })
            }
          >
            Save arrangement
          </button>
        </div>
        <div className="share-manager">
          <nav className="share-links" aria-label="Saved arrangements">
            {versions.data?.map((item) => (
              <button
                className={'share-link-item' + (version?.id === item.id ? ' selected' : '')}
                key={item.id}
                aria-pressed={version?.id === item.id}
                onClick={() => {
                  setSelected(item.id);
                  setRename(item.name);
                }}
              >
                <strong>{item.name}</strong>
                <small>
                  {new Date(item.createdAt).toLocaleDateString()} · {item.layout.prints.length} prints
                </small>
              </button>
            ))}
            {versions.data?.length === 0 && <p className="muted">Save your first alternative above.</p>}
          </nav>
          {version && (
            <div>
              <label>
                Compare with
                <select
                  className="field-in"
                  aria-label="Compare with"
                  value={compare ?? ''}
                  onChange={(event) => setCompare(Number(event.target.value) || null)}
                >
                  <option value="">One arrangement</option>
                  {versions.data
                    ?.filter((item) => item.id !== version.id)
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className={'arrangement-comparison' + (other && other.id !== version.id ? ' two' : '')}>
                {preview(version)}
                {other && other.id !== version.id && preview(other)}
              </div>
              <div className="workflow-shortcuts">
                <button
                  className="btn primary"
                  disabled={readOnly || !version.available}
                  onClick={() => {
                    if (window.confirm(`Apply ${version.name}? The current wall will be saved as a backup.`))
                      void run(() => api(`/collections/${id}/versions/${version.id}/apply`, { body: {} }));
                  }}
                >
                  Apply arrangement
                </button>
                <input
                  className="field-in"
                  aria-label="Rename arrangement"
                  value={rename}
                  placeholder={version.name}
                  maxLength={100}
                  onChange={(event) => setRename(event.target.value)}
                />
                <button
                  disabled={!rename.trim()}
                  onClick={() =>
                    void run(() => api(`/collections/${id}/versions/${version.id}`, { method: 'PATCH', body: { name: rename } }))
                  }
                >
                  Rename
                </button>
                <button
                  disabled={version.links > 0}
                  onClick={() => {
                    if (window.confirm(`Delete saved arrangement ${version.name}?`))
                      void run(() => api(`/collections/${id}/versions/${version.id}`, { method: 'DELETE' }));
                  }}
                >
                  Delete
                </button>
              </div>
              {readOnly && <p className="muted">Choose Progress or Review in the workflow to apply an arrangement.</p>}
            </div>
          )}
        </div>
      </fieldset>
    </Modal>
  );
}
