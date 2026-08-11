import { useState } from 'react';
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
  // The note is user-editable (below), so the marker is a deliberately
  // unnatural string — a plain phrase like "dominant color" could plausibly
  // be typed as a genuine note on a real suggested tag, silently marking
  // it "confirmed" without the user ever actually confirming it.
  const isColorTag = tag.note === 'auto:dominant-color';
  const isSuggestion = tag.source === 'ai_suggested' && !isColorTag;
  // Starts open when a real note already exists, so an existing note stays
  // visible without an extra click — otherwise the input (which used to
  // sit always-open, tripling each chip's width and burying the tag names)
  // stays collapsed until deliberately opened.
  const [noteOpen, setNoteOpen] = useState(!!tag.note && !isColorTag);

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
      {onNoteChange && !isColorTag && !noteOpen && (
        <button className="tag-chip__note-toggle" title="Add a note" onClick={() => setNoteOpen(true)}>
          ⋯
        </button>
      )}
      {onDismiss && (
        <button className="tag-chip__dismiss" title="Remove this tag" onClick={onDismiss}>
          ×
        </button>
      )}
      {onNoteChange && !isColorTag && noteOpen && (
        <input
          className="tag-chip__note"
          placeholder="note…"
          autoFocus={!tag.note}
          defaultValue={tag.note ?? ''}
          onBlur={(e) => {
            if (e.target.value !== (tag.note ?? '')) onNoteChange(e.target.value);
            if (!e.target.value) setNoteOpen(false);
          }}
        />
      )}
    </div>
  );
}
