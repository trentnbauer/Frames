import type { DB } from './db.js';
import type { Cfg } from './ingest.js';
import type { createAiWorker } from './ai.js';
import type { Tenant, Tenants } from './tenants.js';

export type Row = Record<string, any>;
export type AppCfg = Cfg & { webDir?: string; authUser?: string; authPassword?: string; allowedHosts?: string[]; version?: string; maxUploadMb?: number; trustProxy?: boolean; allowEnvExport?: boolean; accessCertsBase?: string; libraryRoots?: string[]; skip?: string[]; allowSignups?: boolean; userId?: number; cloudflareApi?: string; authDisabled?: boolean; allowInsecureOidc?: boolean; cloudBase?: string };

/** What the route modules share. Built once in buildApp. */
export type Ctx = {
  db: DB;
  cfg: AppCfg;
  num: (v: unknown, d?: number) => number;
  one: (sql: string, ...a: unknown[]) => Row | undefined;
  all: (sql: string, ...a: unknown[]) => Row[];
  notFound: (rep: any, what?: string) => any;
  photoDto: (p: Row, full?: boolean, agg?: Map<number, { n: number; a: number }>) => Record<string, any>;
  shootDto: (s: Row) => Record<string, any>;
  collectionDto: (c: Row) => Record<string, any>;
  tagsOf: (id: number) => Record<string, any>[];
  ratingAgg: () => Map<number, { n: number; a: number }>;
  ai: ReturnType<typeof createAiWorker>;
  /** Starts the background sync. Resolves when finished. */
  startScan: () => Promise<unknown>;
  scanning: () => boolean;
  /** The instance-wide database: people, sessions, sign-in providers. Never a person's library. */
  sys: DB;
  tenants: Tenants;
  /** Whose library this request is for. */
  tenant: () => Tenant;
  /** Scratch state that belongs to the person making the request (a running rebuild, for example). */
  bag: <T>(key: string, init: () => T) => T;
  /** Is anything protecting this instance right now (a password or OAuth sign-in)? */
  isProtected: () => boolean;
  /** This server's public address as the visitor sees it (used for OAuth return addresses). */
  baseUrl: (req: any) => string;
};
