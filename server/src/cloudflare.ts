/**
 * The few Cloudflare API calls Frames needs to set a tunnel up for you:
 * find the zone for a hostname, create a tunnel, give it its routes, point DNS at it, and fetch the token cloudflared runs with.
 * To also put Cloudflare Access (a login at Cloudflare's edge) in front of the app it manages Access applications and policies.
 * The API token needs: Account / Cloudflare Tunnel: Edit, Zone / DNS: Edit (plus Zone: Read), and for Access
 * Account / Access: Apps and Policies: Edit.
 */

export class CloudflareError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type Zone = { id: string; name: string };
export type AccessApp = { id: string; name: string; aud: string };
export type AccessPolicy = { id: string; name: string };
/** The shape of an Access application Frames asks for: one or more public paths (host/path/*) behind one policy. */
export type AccessAppBody = { name: string; destinations: string[]; session: string };
export type AccessPolicyBody = { name: string; decision: 'allow' | 'bypass'; emails?: string[] };

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
    // ---------- Cloudflare Access (the login at the edge) ----------
    /** The team's Access domain (for example team.cloudflareaccess.com), where its signing keys are published. */
    async accessDomain(): Promise<string> {
      const o = await call<{ auth_domain?: string }>('GET', `${acct}/access/organizations`);
      if (!o?.auth_domain) throw new CloudflareError(404, 'Cloudflare Access (Zero Trust) is not set up on this account yet');
      return o.auth_domain;
    },
    async accessApps(): Promise<AccessApp[]> {
      const out: AccessApp[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await call<AccessApp[]>('GET', `${acct}/access/apps?per_page=50&page=${page}`);
        out.push(...r.map((a) => ({ id: a.id, name: a.name, aud: a.aud })));
        if (r.length < 50) break;
      }
      return out;
    },
    async saveAccessApp(id: string | null, b: AccessAppBody): Promise<AccessApp> {
      const body = { name: b.name, type: 'self_hosted', session_duration: b.session, destinations: b.destinations.map((uri) => ({ type: 'public', uri })), app_launcher_visible: false };
      const a = id ? await call<AccessApp>('PUT', `${acct}/access/apps/${id}`, body) : await call<AccessApp>('POST', `${acct}/access/apps`, body);
      return { id: a.id, name: a.name, aud: a.aud };
    },
    async removeAccessApp(id: string): Promise<void> {
      try { await call('DELETE', `${acct}/access/apps/${id}`); } catch (e) { if (!(e instanceof CloudflareError && e.status === 404)) throw e; }
    },
    /** One policy per application: created, or updated in place if it is already there. */
    async saveAccessPolicy(appId: string, b: AccessPolicyBody): Promise<void> {
      const body = { name: b.name, decision: b.decision, include: b.decision === 'bypass' ? [{ everyone: {} }] : (b.emails ?? []).map((email) => ({ email: { email } })) };
      const existing = await call<AccessPolicy[]>('GET', `${acct}/access/apps/${appId}/policies`);
      const mine = existing.find((p) => p.name === b.name);
      if (mine) await call('PUT', `${acct}/access/apps/${appId}/policies/${mine.id}`, body);
      else await call('POST', `${acct}/access/apps/${appId}/policies`, body);
    },
    async removeDns(zoneId: string, recordId: string): Promise<void> {
      try { await call('DELETE', `/zones/${zoneId}/dns_records/${recordId}`); } catch (e) { if (!(e instanceof CloudflareError && e.status === 404)) throw e; }
    },
  };
}
export type Cloudflare = ReturnType<typeof cloudflare>;
