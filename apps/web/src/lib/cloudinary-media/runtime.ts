/**
 * Runtime entrypoint loaded by EmDash (`createMediaProvider`).
 * Portable across Cloudflare Workers (`cloudflare:workers`) and Node/test runtimes (`process.env`).
 */
import type { CreateMediaProviderFn } from "emdash/media";
import { createCloudinaryProvider, type CloudinaryMediaConfig, type EnvLookup } from "./provider";

export type ModuleImporter = (specifier: string) => Promise<unknown>;

const WORKERS_MODULE = "cloudflare:workers";

/** Attempt to load `env` from `cloudflare:workers`, returning `undefined` when unavailable. */
export async function loadWorkersEnv(
	importer: ModuleImporter = (specifier) => import(/* @vite-ignore */ specifier),
): Promise<Record<string, unknown> | undefined> {
	try {
		const mod = (await importer(WORKERS_MODULE)) as { env?: unknown } | null | undefined;
		if (mod && typeof mod === "object" && mod.env && typeof mod.env === "object") {
			return mod.env as Record<string, unknown>;
		}
	} catch {
		// Not running on Cloudflare Workers (e.g. Node / Vitest); fall back to process.env.
	}
	return undefined;
}

/** Build an `EnvLookup` reading non-empty strings from Workers `env` first, then `process.env`. */
export function createRuntimeEnvLookup(
	workersEnv?: Record<string, unknown>,
	nodeEnv?: Record<string, string | undefined>,
): EnvLookup {
	return (name: string): string | undefined => {
		if (workersEnv) {
			try {
				const v = workersEnv[name];
				if (typeof v === "string" && v) return v;
			} catch {
				// Ignore if Workers env proxy throws outside a request context; fall back to process.env.
			}
		}
		const procEnv = nodeEnv ?? (typeof process !== "undefined" ? process.env : undefined);
		const pv = procEnv?.[name];
		return typeof pv === "string" && pv ? pv : undefined;
	};
}

const workersEnv = await loadWorkersEnv();
const lookup = createRuntimeEnvLookup(workersEnv);

export const createMediaProvider: CreateMediaProviderFn<CloudinaryMediaConfig> = (config) =>
	createCloudinaryProvider(config, lookup);
