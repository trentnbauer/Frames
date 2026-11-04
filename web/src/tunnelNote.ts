/** What to add to "Saved." when the tunnel followed the change: the address is shared with Settings, Cloudflare tunnel. */
export const tunnelNote = (t: { updated?: boolean; applied?: boolean; error?: string } | null | undefined) =>
  !t?.updated ? '' : t.applied ? ' The Cloudflare tunnel was updated to match.' : t.error ? ` The Cloudflare tunnel’s address list was updated, but Cloudflare would not take it yet: ${t.error}` : ' The Cloudflare tunnel’s address list was updated to match.';
