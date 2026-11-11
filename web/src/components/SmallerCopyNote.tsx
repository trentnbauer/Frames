/**
 * Shown when photographs are uploaded and this server does not store original quality: the copy kept here is a smaller one, and there is
 * no original in a cloud account to fetch later, so exporting or downloading gives the smaller copy.
 */
export const SMALLER_COPY_WARNING = 'JPEG, PNG and TIFF photos you upload are kept as smaller copies (JPEG, quality 80, the same pixels), so exporting or downloading them later gives that copy, not the file you upload. Keep your originals somewhere else. An administrator can turn on “Store original quality” (Settings, Server, Storage). Photos synced from a cloud folder are different: their originals are fetched from the cloud when you export them.';

export function SmallerCopyNote() {
  return (
    <div role="alert" style={{ fontSize: 12.5, lineHeight: 1.45, padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, oklch(0.75 0.14 28) 14%, transparent)', color: 'var(--text)' }}>
      <b style={{ fontWeight: 600 }}>Smaller copies are kept.</b> {SMALLER_COPY_WARNING}
    </div>
  );
}
