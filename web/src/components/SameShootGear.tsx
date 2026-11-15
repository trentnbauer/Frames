type GearPhoto = { id: number; shootId: number | null; camera: string; lens: string };

export function sameShootGear(photos: GearPhoto[], current: GearPhoto | null | undefined) {
  const peers = current?.shootId == null ? [] : photos.filter((photo) => photo.shootId === current.shootId && photo.id !== current.id);
  return { camera: peers.find((photo) => photo.camera.trim())?.camera ?? '', lens: peers.find((photo) => photo.lens.trim())?.lens ?? '' };
}

export function SameShootGear({ camera, lens, onUse }: { camera: string; lens: string; onUse: (field: 'camera' | 'lens', value: string) => void }) {
  return <>{([['camera', camera], ['lens', lens]] as const).filter(([, value]) => value).map(([field, value]) => <button key={field} type="button" className="protomore-h3" style={{ alignSelf: 'flex-start', fontSize: 13, color: 'var(--text2)', textAlign: 'left' }} onClick={() => onUse(field, value)} aria-label={`Use ${field} ${value} from the same shoot`}>Use “{value}” from the same shoot →</button>)}</>;
}
