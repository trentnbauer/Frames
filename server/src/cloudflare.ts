/**
 * The few Cloudflare API calls Frames needs to set a tunnel up for you (the same steps TunnelMate does):
 * find the zone for a hostname, create a tunnel, give it its routes, point DNS at it, and fetch the token cloudflared runs with.
 * The API token only needs: Account / Cloudflare Tunnel: Edit, and Zone / DNS: Edit (plus Zone: Read).
 */

export class CloudflareError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Zone = { id: string; name: string };

export function cloudflare(token: string, accountId: string, base = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4') {
  async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
    if (!r.ok || j.success === false) {
      // Cloudflare's own message is useful ("Authentication error", "zone not found") and holds no secrets.
      throw new CloudflareError(r.status, j.errors?.map((e) => e.message).join('; ') || `Cloudflare answered ${r.status}`);
    }
    return j.result as T;
  }
  const acct = `/accounts/${encodeURIComponent(accountId)}`;

  return {
    /** The zone (domain) a hostname belongs to: the longest zone name the hostname ends with. */
    async zoneFor(hostname: string): Promise<Zone> {
      const zones: Zone[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await call<Zone[]>('GET', `/zones?per_page=50&page=${page}`);
        zones.push(...r.map((z) => ({ id: z.id, name: z.name })));
        if (r.length < 50) break;
      }
      const z = zones.filter((z) => hostname === z.name || hostname.endsWith(`.${z.name}`)).sort((a, b) => b.name.length - a.name.length)[0];
      if (!z) throw new CloudflareError(404, `No domain on this Cloudflare account matches ${hostname}`);
      return z;
    },
    async tunnelExists(id: string): Promise<boolean> {
      try { const t = await call<{ deleted_at?: string | null }>('GET', `${acct}/cfd_tunnel/${id}`); return !t.deleted_at; } catch (e) { if (e instanceof CloudflareError && e.status === 404) return false; throw e; }
    },
    /** A tunnel whose routes are managed through the API (so no files, and no restart to change a route). */
    async createTunnel(name: string): Promise<{ id: string }> {
      const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
      const t = await call<{ id: string }>('POST', `${acct}/cfd_tunnel`, { name, config_src: 'cloudflare', tunnel_secret: secret });
      return { id: t.id };
    },
    async setRoutes(id: string, routes: { hostname: string; service: string }[]): Promise<void> {
      await call('PUT', `${acct}/cfd_tunnel/${id}/configurations`, { config: { ingress: [...routes.map((r) => ({ hostname: r.hostname, service: r.service })), { service: 'http_status:404' }] } });
    },
    async token(id: string): Promise<string> { return call<string>('GET', `${acct}/cfd_tunnel/${id}/token`); },
    /** A proxied CNAME to the tunnel. Reuses a record that is already right, fixes one that is wrong. Returns its id. */
    async pointDns(zoneId: string, hostname: string, tunnelId: string): Promise<string> {
      const target = `${tunnelId}.cfargotunnel.com`;
      const found = await call<{ id: string; type: string; content: string }[]>('GET', `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`);
      const mine = found.find((r) => r.type === 'CNAME');
      if (found.some((r) => r.type !== 'CNAME')) throw new CloudflareError(409, `${hostname} already has a non-CNAME DNS record. Remove it in Cloudflare first.`);
      const body = { type: 'CNAME', name: hostname, content: target, ttl: 1, proxied: true };
      if (mine) { if (mine.content !== target) await call('PUT', `/zones/${zoneId}/dns_records/${mine.id}`, body); return mine.id; }
      return (await call<{ id: string }>('POST', `/zones/${zoneId}/dns_records`, body)).id;
    },
    async removeDns(zoneId: string, recordId: string): Promise<void> {
      try { await call('DELETE', `/zones/${zoneId}/dns_records/${recordId}`); } catch (e) { if (!(e instanceof CloudflareError && e.status === 404)) throw e; }
    },
  };
}
export type Cloudflare = ReturnType<typeof cloudflare>;
