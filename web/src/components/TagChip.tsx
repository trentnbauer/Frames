import type { PhotoTag } from '../types.js';

interface Props {
  tag: PhotoTag;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onNoteChange?: (note: string) => void;
}

export function TagChip({ tag, onConfirm, onDismiss, onNoteChange }: Props) {
  const isSuggestion = tag.source === 'ai_suggested';

  return (
    <div className={`tag-chip ${isSuggestion ? 'tag-chip--suggested' : 'tag-chip--confirmed'}`}>
      <span className="tag-chip__name">{tag.name}</span>
      {isSuggestion && onConfirm && (
        <button className="tag-chip__accept" title="Confirm this tag" onClick={onConfirm}>
          ✓
        </button>
      )}
      {onDismiss && (
        <button className="tag-chip__dismiss" title="Remove this tag" onClick={onDismiss}>
          ×
        </button>
      )}
      {onNoteChange && (
        <input
          className="tag-chip__note"
          placeholder="note…"
          defaultValue={tag.note ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (tag.note ?? '')) onNoteChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
