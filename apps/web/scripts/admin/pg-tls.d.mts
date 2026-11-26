import type { ConnectionOptions } from "node:tls";

export interface ILoadCaOptions {
	env?: Record<string, string | undefined>;
	defaultPath?: string;
	readFile?: (path: string, encoding: "utf8") => string;
	exists?: (path: string) => boolean;
}

export type PgSsl = false | (ConnectionOptions & { ca: string; rejectUnauthorized: true });

export declare const DEFAULT_SUPABASE_CA_PATH: string;
export declare const SUPABASE_ROOT_CA_SHA256: string;
export declare function isLocalDbHost(hostname: string): boolean;
export declare function loadDatabaseCa(opts?: ILoadCaOptions): string;
export declare function pgSslFor(url: string, opts?: ILoadCaOptions): PgSsl;
export declare function pgClientConfig(url: string, opts?: ILoadCaOptions): { connectionString: string; ssl: PgSsl };
