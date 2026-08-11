// Small swatch shown before a dominant-color tag's name, so it reads as
// "this photo contains this color" rather than looking like any other
// subject tag. `name` is always one of COLOR_TAG_NAMES' entries, which are
// all valid CSS color keywords.
export function ColorDot({ name }: { name: string }) {
  return <span className="color-tag-dot" style={{ background: name }} />;
}
