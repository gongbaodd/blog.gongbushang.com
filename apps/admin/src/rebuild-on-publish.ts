/**
 * Node runtime & config-time wrapper for the `rebuild-on-publish` EmDash plugin (D9, D12).
 *
 * Wraps the pure `dispatchOnPublish` from `apps/web` with `process.env` lookup —
 * no `cloudflare:workers` import anywhere in `apps/admin/`.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type PluginDescriptor } from "emdash";
import {
	buildDispatchRequest,
	dispatchOnPublish,
	resolveEnvironment,
	type DispatchEnv,
	type Logger,
	type PublishInfo,
} from "../../web/src/plugins/rebuild-on-publish/dispatch.ts";

export function readNodeDispatchEnv(env: NodeJS.ProcessEnv = process.env): DispatchEnv {
	const read = (name: keyof DispatchEnv): string | undefined => {
		const value = env?.[name];
		return typeof value === "string" && value.length > 0 ? value : undefined;
	};
	return {
		GITHUB_DISPATCH_TOKEN: read("GITHUB_DISPATCH_TOKEN"),
		GITHUB_DISPATCH_REPO: read("GITHUB_DISPATCH_REPO"),
		// A custom API base (fake GitHub for tests) is honoured only for SITE_ENV=local; production always uses api.github.com.
		GITHUB_API_URL: read("SITE_ENV") === "local" ? read("GITHUB_API_URL") : undefined,
		SITE_ENV: read("SITE_ENV"),
	};
}

export async function dispatchFromNodeEnv(
	info: PublishInfo,
	log: Logger,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: typeof fetch = fetch,
): Promise<void> {
	await dispatchOnPublish(readNodeDispatchEnv(env), info, log, fetchImpl);
}

export interface RebuildOnPublishPluginOptions {
	env?: NodeJS.ProcessEnv;
	fetchImpl?: typeof fetch;
}

const DEFAULT_SUPPRESS_TTL_MS = 60_000;
const suppressedDispatches = new Map<string, number>();

function dispatchKey(collection: string, id: string): string {
	return `${collection}:${id}`;
}

function pruneExpiredSuppressions(now: number): void {
	for (const [key, expiresAt] of suppressedDispatches) {
		if (expiresAt <= now) suppressedDispatches.delete(key);
	}
}

/**
 * Marks a single `(collection, id)` publish as handled by an explicit batch rebuild dispatch so
 * its deferred `content:afterPublish` hook does not trigger a duplicate GitHub repository_dispatch.
 */
export function suppressPublishDispatch(
	collection: string,
	id: string,
	ttlMs: number = DEFAULT_SUPPRESS_TTL_MS,
	now: number = Date.now(),
): void {
	pruneExpiredSuppressions(now);
	suppressedDispatches.set(dispatchKey(collection, id), now + ttlMs);
}

/** Returns true (and consumes the marker) if per-item dispatch was suppressed for `(collection, id)`. */
export function consumeSuppressedPublishDispatch(
	collection: string,
	id: string,
	now: number = Date.now(),
): boolean {
	pruneExpiredSuppressions(now);
	const key = dispatchKey(collection, id);
	const expiresAt = suppressedDispatches.get(key);
	if (expiresAt === undefined) return false;
	suppressedDispatches.delete(key);
	return expiresAt > now;
}

/** Clears all suppression markers (intended for tests). */
export function clearSuppressedPublishDispatches(): void {
	suppressedDispatches.clear();
}

export function createPlugin(options: RebuildOnPublishPluginOptions = {}) {
	return definePlugin({
		id: "rebuild-on-publish",
		version: "0.1.0",
		capabilities: ["content:read"],
		hooks: {
			"content:afterPublish": async (event, ctx) => {
				const content = event.content;
				const id = String(content.id ?? "");
				const slug = typeof content.slug === "string" ? content.slug : undefined;
				if (id && consumeSuppressedPublishDispatch(event.collection, id)) {
					ctx.log.info(
						`rebuild-on-publish: suppressed per-item dispatch for ${event.collection}/${slug ?? id} (batch sync)`,
					);
					return;
				}
				await dispatchFromNodeEnv(
					{
						collection: event.collection,
						id,
						slug,
					},
					ctx.log,
					options.env ?? process.env,
					options.fetchImpl ?? fetch,
				);
			},
		},
	});
}

export function rebuildOnPublish(): PluginDescriptor {
	return {
		id: "rebuild-on-publish",
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./rebuild-on-publish.ts", import.meta.url)),
	};
}

export {
	buildDispatchRequest,
	dispatchOnPublish,
	resolveEnvironment,
	type DispatchEnv,
	type Logger,
	type PublishInfo,
};
export default createPlugin;
