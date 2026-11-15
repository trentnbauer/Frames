import { useMemo, useState } from 'react';
import { api } from '../api';
import { finishBulkJob } from './BulkJobs';
import { Modal } from './Modal';
import { GearPicker } from './GearPicker';
import ProtoMapPicker from '../proto/ProtoMapPicker';
type Place = { name: string; address: string; kind: string; lat: number; lng: number; precision: string; suburb: string; city: string };
type Preview = { changed: number; unchanged: number; missing: number; counts: Record<string, number>; versions: Record<string, string> };
export function BulkEdit({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const [values, setValues] = useState({ camera: '', lens: '', film: '', description: '', dateEdit: '', tags: '', subjects: '' }),
    [enabled, setEnabled] = useState<Record<string, boolean>>({}),
    [fillBlanks, setFillBlanks] = useState(true),
    [blankFields, setBlankFields] = useState<Record<string, boolean>>({}),
    [place, setPlace] = useState<Place | null>(null),
    [map, setMap] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState('');
  const patch = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values))
      if (enabled[key])
        result[key] =
          key === 'tags' || key === 'subjects'
            ? value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)
            : value;
    if (enabled.location)
      Object.assign(result, {
        place: place?.name ?? '',
        placeAddress: place?.address ?? '',
        placeKind: place?.kind ?? '',
        placePrecision: place?.precision ?? 'exact',
        lat: place?.lat ?? null,
        lon: place?.lng ?? null,
      });
    return result;
  }, [values, enabled, place]);
  const change = (field: keyof typeof values, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setEnabled((current) => ({ ...current, [field]: true }));
    setPreview(null);
  };
  const run = async (apply: boolean) => {
    setBusy(true);
    setError('');
    try {
      const body = { ids, patch, fillBlanks, blankFields };
      if (apply && ids.length > 500) {
        const job = await api<{ id: string }>('/photos/bulk-jobs', { body: { ...body, versions: preview?.versions } });
        await finishBulkJob(job.id, setProgress);
        onDone();
        onClose();
      } else if (apply) {
        await api('/photos/bulk-apply', { body: { ...body, versions: preview?.versions } });
        onDone();
        onClose();
      } else {
        const result: Preview = { changed: 0, unchanged: 0, missing: 0, counts: {}, versions: {} };
        for (let start = 0; start < ids.length; start += 500) {
          const chunk = await api<Preview>('/photos/bulk-preview', { body: { ...body, ids: ids.slice(start, start + 500) } });
          result.changed += chunk.changed;
          result.unchanged += chunk.unchanged;
          result.missing += chunk.missing;
          Object.assign(result.versions, chunk.versions);
          for (const [key, count] of Object.entries(chunk.counts)) result.counts[key] = (result.counts[key] ?? 0) + count;
          setProgress(`${Math.min(start + 500, ids.length)} of ${ids.length} previewed`);
        }
        setPreview(result);
      }
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        title={`Edit ${ids.length} photographs`}
        sub="Choose fields, preview the changes, then apply. Original files stay unchanged."
        width={860}
        onClose={() => !busy && onClose()}
        foot={
          <>
            <span className="grow">
              {preview
                ? `${preview.changed} changed · ${preview.unchanged} unchanged · ${preview.missing} unavailable`
                : ids.length > 10000
                  ? 'Select up to 10,000 photographs per edit.'
                  : ''}
            </span>
            <button className="btn" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={busy || !Object.keys(patch).length || ids.length > 10000}
              onClick={() => void run(!!preview)}
            >
              {busy ? progress || 'Working…' : preview ? `Apply to ${preview.changed} photos` : 'Preview changes'}
            </button>
          </>
        }
      >
        <fieldset disabled={busy} className="batch-edit-fields">
          <label className="batch-choice">
            <input
              type="checkbox"
              checked={fillBlanks}
              onChange={(event) => {
                setFillBlanks(event.target.checked);
                setBlankFields({});
                setPreview(null);
              }}
            />
            Fill blanks only
          </label>
          <p className="muted">Uncheck to replace selected fields, including clearing them. Unselected fields stay unchanged.</p>
          {Object.entries(values).map(([key, value]) => (
            <div key={key} className="batch-edit-row">
              <label className="batch-choice">
                <input
                  type="checkbox"
                  checked={!!enabled[key]}
                  aria-label={`Change ${key}`}
                  onChange={(event) => {
                    setEnabled((current) => ({ ...current, [key]: event.target.checked }));
                    setPreview(null);
                  }}
                />
                {
                  (
                    {
                      camera: 'Camera body',
                      lens: 'Lens',
                      film: 'Film stock',
                      description: 'Description',
                      dateEdit: 'Date',
                      tags: 'Tags to add',
                      subjects: 'Subjects to add',
                    } as Record<string, string>
                  )[key]
                }
              </label>
              {key === 'camera' || key === 'lens' ? (
                <GearPicker
                  kind={key}
                  value={value}
                  onCommit={(next) => change(key, next)}
                  placeholder={key === 'camera' ? 'Camera body' : 'Lens'}
                  title="Owned and discovered gear, or free text"
                  className="field-in"
                />
              ) : key === 'description' ? (
                <textarea
                  aria-label="Bulk description"
                  className="field-in"
                  value={value}
                  maxLength={2000}
                  onChange={(event) => change(key, event.target.value)}
                />
              ) : (
                <input
                  className="field-in"
                  aria-label={`Bulk ${key}`}
                  type={key === 'dateEdit' ? 'date' : 'text'}
                  value={value}
                  placeholder={key === 'tags' || key === 'subjects' ? 'Comma-separated names' : ''}
                  onChange={(event) => change(key as keyof typeof values, event.target.value)}
                />
              )}{' '}
              {key !== 'tags' && key !== 'subjects' && (
                <label className="batch-choice">
                  <input
                    type="checkbox"
                    aria-label={`Fill blank ${key} only`}
                    checked={blankFields[key] ?? fillBlanks}
                    onChange={(event) => {
                      setBlankFields((current) => ({ ...current, [key]: event.target.checked }));
                      setPreview(null);
                    }}
                  />
                  Blanks only
                </label>
              )}
            </div>
          ))}
          <div className="batch-edit-row">
            <label className="batch-choice">
              <input
                type="checkbox"
                aria-label="Change location"
                checked={!!enabled.location}
                onChange={(event) => {
                  setEnabled((current) => ({ ...current, location: event.target.checked }));
                  setPreview(null);
                }}
              />
              Location
            </label>
            <label className="batch-choice">
              <input
                type="checkbox"
                checked={blankFields.location ?? fillBlanks}
                onChange={(event) => {
                  setBlankFields((current) => ({ ...current, location: event.target.checked }));
                  setPreview(null);
                }}
              />
              Blanks only
            </label>
            <button className="btn outline" onClick={() => setMap(true)}>
              {place?.name || 'Pick on map'}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPlace(null);
                setEnabled((current) => ({ ...current, location: true }));
                setPreview(null);
              }}
            >
              Clear location
            </button>
          </div>
          {preview && (
            <div className="workflow-preview">
              <h3 className="serif">Change preview</h3>
              {Object.entries(preview.counts).map(([field, count]) => (
                <p key={field}>
                  {field}: {count} photographs
                </p>
              ))}
            </div>
          )}
          {error && (
            <p className="reason" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      </Modal>
      {map && (
        <ProtoMapPicker
          place={place}
          searchPlaces={(q: string) => api(`/map/search?q=${encodeURIComponent(q)}`)}
          reversePlace={(lat: number, lon: number) => api(`/map/reverse?lat=${lat}&lon=${lon}`)}
          onSavePlace={async (value: Place) => {
            setPlace(value);
            setEnabled((current) => ({ ...current, location: true }));
            setPreview(null);
          }}
          onRemovePlace={async () => {
            setPlace(null);
            setEnabled((current) => ({ ...current, location: true }));
            setPreview(null);
          }}
          onClose={() => setMap(false)}
        />
      )}
    </>
  );
}
