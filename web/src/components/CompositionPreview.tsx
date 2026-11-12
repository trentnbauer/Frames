import type { Collection } from '../data';
import { arrange, bounds } from '../layout';
import { Wall, type Pic } from './CompositionWall';

const noop = () => {};

/** Use the same print renderer and physical layout as the editor, closely framed inside the card. */
export function CompositionPreview({ collection, photos }: { collection: Collection; photos: Map<number, Pic> }) {
  const prints = collection.layout.mode === 'free' ? collection.layout.prints : arrange(collection.layout.prints, collection.layout.mode);
  const b = bounds(prints);
  return <div aria-label={`Preview of ${collection.name}`} style={{ aspectRatio: '1.6', borderRadius: 8, background: '#33322f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <Wall prints={prints} mode={collection.layout.mode} photos={photos} editing={false} locked sel={-1} over={null} fitRatio={1.6} hideLabels padding={Math.max(b.w, b.h) * 0.04} imageKind="thumb" onSelect={noop} onEdit={noop} onMoved={noop} onOver={noop} onDropPhoto={noop} />
  </div>;
}
