import { useMemo } from 'react';
import { api, imgUrl, useApi } from '../api';
import type { Collection } from '../data';
import { useUi } from '../ui';
import ProtoCompPicker from '../proto/ProtoCompPicker';

/**
 * The one composition picker (design: Proto Comp Picker), used by Library, Photo, Search and Review.
 * Ticking adds the photographs as candidates (never straight into a print); unticking removes them. Printed compositions are hidden.
 */
export function CompPicker({ ids, onClose, onDone, from }: { ids: number[]; onClose: () => void; onDone: (msg: string) => void; from?: string }) {
  const colls = useApi<Collection[]>('/collections');
  const { openNew } = useUi();
  const open = useMemo(() => (colls.data ?? []).filter((c) => !c.printedAt).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id), [colls.data]);
  const has = (c: Collection) => ids.length > 0 && ids.every((id) => c.photoIds.includes(id));
  const comps = open.map((c) => ({ name: c.name, meta: `${c.layout.prints.length} print${c.layout.prints.length === 1 ? '' : 's'} · ${c.photoIds.length} candidates` }));
  const already = open.filter(has).map((c) => c.name);
  const done = async (sel: string[] | null, msg: string, newName: string) => {
    if (sel === null) { onClose(); openNew({ name: newName, photoIds: ids }); return; }
    for (const c of open) {
      const on = sel.includes(c.name);
      if (on === has(c)) continue;
      for (const id of ids) if (on ? !c.photoIds.includes(id) : c.photoIds.includes(id)) await api(`/collections/${c.id}/photos/${id}`, { method: on ? 'PUT' : 'DELETE' });
    }
    colls.reload();
    onDone(msg);
  };
  return <ProtoCompPicker count={ids.length} thumbs={ids.slice(0, 3).map((id) => imgUrl(id, 'thumb'))} comps={comps} already={already} from={from} onClose={onClose} onDone={done} />;
}
