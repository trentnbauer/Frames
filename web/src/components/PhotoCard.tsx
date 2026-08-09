import type { Photo } from '../types.js';

interface Props {
  photo: Photo;
  onClick: () => void;
}

export function PhotoCard({ photo, onClick }: Props) {
  return (
    <button className="photo-card" onClick={onClick}>
      <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
      {photo.tagging_status === 'pending' && <span className="photo-card__badge">tagging…</span>}
      <div className="photo-card__tags">
        {photo.tags.slice(0, 3).map((t) => (
          <span key={t.id} className={`photo-card__tag ${t.source === 'ai_suggested' ? 'is-suggested' : ''}`}>
            {t.name}
          </span>
        ))}
      </div>
    </button>
  );
}
