import type { Photo } from '../types.js';

interface Props {
  photo: Photo;
  onClick: () => void;
}

export function PhotoCard({ photo, onClick }: Props) {
  return (
    <div className="photo-tile-card">
      <button className="photo-tile-card__img-btn" onClick={onClick}>
        <img src={`/files/thumb/${photo.id}`} alt={photo.filename} loading="lazy" />
      </button>
      {photo.tagging_status === 'pending' && <span className="photo-tile-card__badge">tagging…</span>}
      <div className="photo-tile-card__meta">
        <div className="photo-tile-card__filename">{photo.filename}</div>
        <div className="photo-tile-card__tags">
          {photo.tags.slice(0, 3).map((t) => (
            <span key={t.id} className="tag-pill-soft">{t.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
