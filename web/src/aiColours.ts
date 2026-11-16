/** Restrict provider tints to accessible, muted palette colours from the AI colour mockup. */
export const AI_COLOURS = [
  { name: 'Default grey', value: '' },
  { name: 'Amber', value: '#e7b76d' },
  { name: 'Sage', value: '#a6c5aa' },
  { name: 'Blue', value: '#94abd4' },
  { name: 'Rose', value: '#c88d9c' },
  { name: 'Terracotta', value: '#d08e6c' },
  { name: 'Lavender', value: '#b9a1d8' },
  { name: 'Teal', value: '#79bcc0' },
] as const;
export type AiColour = (typeof AI_COLOURS)[number];
export type SourceTint = { id: string; name: string; color?: string };
/** Historical suggestions have no source: use neutral styling, not the currently selected provider. */
export function aiTint(id: string | undefined, sources: SourceTint[]): string {
  return id ? sources.find((source) => source.id === id)?.color ?? '' : '';
}
export function tintedChip(color: string) {
  return color ? {
    color: 'var(--text)',
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 68%, transparent)`,
  } : {
    color: 'var(--text2)',
    background: 'transparent',
    boxShadow: 'inset 0 0 0 1px var(--outline)',
  };
}
