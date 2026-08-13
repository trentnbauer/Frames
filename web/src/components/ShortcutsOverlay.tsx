import { useEscapeKey } from '../useEscapeKey.js';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['← / →', 'Previous / next photo (open frame)'],
  ['f', 'Toggle favorite (open frame)'],
  ['d / Delete', 'Move open frame to trash'],
  ['/', 'Focus the Library search box'],
  ['Esc', 'Close the open dialog'],
  ['?', 'Show this cheat sheet'],
];

export function ShortcutsOverlay({ onClose }: Props) {
  useEscapeKey(true, onClose);

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-card" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        {SHORTCUTS.map(([key, label]) => (
          <div key={key} className="shortcuts-card__row">
            <span>{label}</span>
            <span className="shortcuts-card__key">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
