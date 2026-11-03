import type { DB } from './db.js';
import type { Cfg } from './ingest.js';
import type { createAiWorker } from './ai.js';

export type Row = Record<string, any>;
export type AppCfg = Cfg & { webDir?: string; authUser?: string; authPassword?: string; allowedHosts?: string[]; version?: string; maxUploadMb?: number; trustProxy?: boolean; cloudflareApi?: string; authDisabled?: boolean; allowInsecureOidc?: boolean; cloudBase?: string };

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
  /** Is anything protecting this instance right now (a password or OAuth sign-in)? */
  isProtected: () => boolean;
  /** This server's public address as the visitor sees it (used for OAuth return addresses). */
  baseUrl: (req: any) => string;
};
