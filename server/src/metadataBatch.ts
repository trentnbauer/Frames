import type { DB } from './db.js';
import type { Row } from './ctx.js';
import { syncPhotoGear } from './gear.js';
import { journal, photoChange, photoTags, photoVersion, WorkflowError } from './workflowCore.js';
const textFields: Record<string, [string, number]> = {
  camera: ['camera', 120],
  lens: ['lens', 120],
  film: ['film', 60],
  description: ['description', 2000],
  title: ['title', 200],
  place: ['place', 120],
  placeAddress: ['place_address', 240],
  placeKind: ['place_kind', 40],
  placePrecision: ['place_precision', 10],
  dateEdit: ['date_edit', 10],
};
export function metadataInput(body: Row) {
  if (
    !Array.isArray(body.ids) ||
    !body.ids.length ||
    body.ids.length > 500 ||
    body.ids.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1)
  )
    throw new WorkflowError('Choose between 1 and 500 photographs.');
  if (!body.patch || typeof body.patch !== 'object' || Array.isArray(body.patch)) throw new WorkflowError('Send the fields to edit.');
  const patch: Row = {};
  for (const [key, value] of Object.entries(body.patch)) {
    if (Object.hasOwn(textFields, key)) {
      if (typeof value !== 'string') throw new WorkflowError('Metadata fields must be text.');
      const [col, max] = textFields[key];
      if (key === 'placePrecision' && !['exact', 'suburb', 'city'].includes(value))
        throw new WorkflowError('Choose exact, suburb or city location precision.');
      if (value.length > max) throw new WorkflowError(`${key} is too long.`);
      patch[col] = key === 'dateEdit' && !value.trim() ? null : value.trim();
      if (
        key === 'dateEdit' &&
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw new WorkflowError('Use a valid date.');
    } else if (key === 'lat' || key === 'lon') {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > (key === 'lat' ? 90 : 180)))
        throw new WorkflowError('Choose valid map coordinates.');
      patch[key] = value;
    } else if (key === 'medium') {
      if (!['', 'film', 'digital'].includes(String(value))) throw new WorkflowError('Choose film or digital.');
      patch.medium = value;
    } else if (key === 'tags') {
      if (!Array.isArray(value) || value.length > 100 || value.some((v) => typeof v !== 'string' || !v.trim() || v.length > 60))
        throw new WorkflowError('Tags must be short names.');
      patch[key] = [...new Set(value.map((v) => v.trim().toLowerCase()))];
    } else throw new WorkflowError(`Unsupported field: ${key}`);
  }
  if ('lat' in patch !== 'lon' in patch) throw new WorkflowError('Choose both map coordinates.');
  if (!Object.keys(patch).length) throw new WorkflowError('Choose at least one field.');
  return { ids: [...new Set(body.ids)] as number[], patch, blanks: body.fillBlanks !== false };
}
export function metadataBatch(db: DB, body: Row, apply: boolean) {
  const { ids, patch, blanks } = metadataInput(body);
  if (
    body.blankFields !== undefined &&
    (!body.blankFields ||
      typeof body.blankFields !== 'object' ||
      Array.isArray(body.blankFields) ||
      Object.values(body.blankFields).some((value) => typeof value !== 'boolean'))
  )
    throw new WorkflowError('Choose a fill-blanks preference for each field.');
  return db.transaction(() => {
    const versions: Row = {},
      counts: Row = {},
      changes: Row[] = [];
    let changed = 0,
      missing = 0;
    for (const id of ids) {
      const before = db.prepare('SELECT * FROM photos WHERE id=?').get(id) as Row | undefined;
      if (!before) {
        missing++;
        continue;
      }
      const tags = photoTags(db, id);
      versions[id] = photoVersion(before, tags);
      if (apply && (!body.versions || body.versions[id] !== versions[id]))
        throw new WorkflowError('A selected photo changed. Preview the edits again.', 409);
      const values: Row = {};
      let tagChanges = false;
      for (const [field, value] of Object.entries(patch)) {
        if (field === 'tags') {
          const kind = 'tag';
          const absent = (value as string[]).filter((name) => !tags.some((t) => t.name === name && t.kind === kind && t.accepted === 1));
          if (absent.length) {
            tagChanges = true;
            counts[field] = (counts[field] ?? 0) + 1;
            if (apply)
              for (const name of absent)
                db.prepare(
                  "INSERT INTO tags(photo_id,name,kind,source,accepted) VALUES(?,?,?,'user',1) ON CONFLICT(photo_id,name) DO UPDATE SET kind=excluded.kind,source='user',accepted=1",
                ).run(id, name, kind);
          }
          continue;
        }
        const locationField = ['lat', 'lon', 'place', 'place_address', 'place_kind', 'place_precision'].includes(field);
        const blank = locationField
          ? before.lat === null && before.lon === null && !String(before.place ?? '').trim()
          : before[field] === null || before[field] === '';
        const apiField = locationField ? 'location' : (Object.entries(textFields).find(([, spec]) => spec[0] === field)?.[0] ?? field);
        const onlyBlank = body.blankFields?.[apiField] ?? blanks;
        if ((!onlyBlank || blank) && JSON.stringify(before[field]) !== JSON.stringify(value)) {
          values[field] = value;
          counts[field] = (counts[field] ?? 0) + 1;
        }
      }
      if (!Object.keys(values).length && !tagChanges) continue;
      changed++;
      if (!apply) continue;
      if ('camera' in values) values.raw_camera = values.camera;
      if ('lens' in values) values.raw_lens = values.lens;
      const marked = new Set(
        String(before.user_fields ?? '')
          .split(',')
          .filter(Boolean),
      );
      for (const key of Object.keys(values)) if (['camera', 'lens', 'film', 'medium'].includes(key)) marked.add(key);
      if ('lat' in values) marked.add('latlon');
      if ('date_edit' in values) marked.add('captured_at');
      values.user_fields = [...marked].join(',');
      if ('description' in values) values.desc_source = values.description ? 'user' : '';
      if ('title' in values) values.title_user = 1;
      const keys = Object.keys(values);
      db.prepare(`UPDATE photos SET ${keys.map((key) => `${key}=?`).join(',')} WHERE id=?`).run(...keys.map((key) => values[key]), id);
      syncPhotoGear(db, id);
      const after = db.prepare('SELECT * FROM photos WHERE id=?').get(id) as Row;
      const change = photoChange(before, after, tags, photoTags(db, id));
      if (change) changes.push(change);
    }
    return {
      changed,
      unchanged: ids.length - changed - missing,
      missing,
      counts,
      versions,
      operationId: apply ? journal(db, `Edit ${changed} photographs`, changes) : null,
    };
  })();
}
