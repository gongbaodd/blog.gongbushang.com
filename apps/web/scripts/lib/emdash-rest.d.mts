// Types for emdash-rest.mjs (used by packages/fetch-podcast, which is type-checked by the root project).
export interface EmdashItem {
  id: string;
  slug?: string;
  status?: string;
  data?: Record<string, any>;
}
export interface EmdashClient {
  base: string;
  isLocal: boolean;
  api(method: string, path: string, body?: unknown): Promise<any>;
  listByLegacyId(collection: string): Promise<{ byLegacy: Map<string, EmdashItem>; dupes: { legacy_id: string; ids: string[] }[] }>;
}
export function createClient(opts?: { url?: string; token?: string; headers?: Record<string, string> }): EmdashClient;
export function isoOrNull(d: unknown): string | null;
export function same(a: unknown, b: unknown): boolean;
export function upsert(
  client: EmdashClient,
  collection: string,
  slug: string,
  data: Record<string, unknown>,
  existing: EmdashItem | undefined,
  opts?: { dry?: boolean; update?: boolean },
): Promise<{ action: string; id: string | null; changed?: string[] }>;
