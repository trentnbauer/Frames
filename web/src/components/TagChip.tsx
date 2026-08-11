import type { PhotoTag } from '../types.js';
import { ColorDot } from './ColorDot.js';

interface Props {
  tag: PhotoTag;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onNoteChange?: (note: string) => void;
}

export function TagChip({ tag, onConfirm, onDismiss, onNoteChange }: Props) {
  // A dominant-color tag is a measured fact, not a judgment call an AI
  // model could get wrong — asking the user to confirm it the same way
  // as a fallible vision-model suggestion is busywork with nothing to
  // actually resolve, so it skips the pending/confirm treatment entirely.
  const isColorTag = tag.note === 'dominant color';
  const isSuggestion = tag.source === 'ai_suggested' && !isColorTag;

  return (
    <div className={`tag-chip ${isSuggestion ? 'tag-chip--suggested' : 'tag-chip--confirmed'}`}>
      <span className="tag-chip__name">
        {isColorTag && <ColorDot name={tag.name} />}
        {tag.name}
      </span>
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
