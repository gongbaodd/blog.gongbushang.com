/**
 * Node runtime & config-time wrapper for the Cloudinary media provider (D6, D12).
 *
 * Wraps the pure `createCloudinaryProvider` from `apps/web` with a `process.env`
 * lookup — no `cloudflare:workers` import anywhere in `apps/admin/`.
 */
import { fileURLToPath } from "node:url";
import type { CreateMediaProviderFn, MediaProvider, MediaProviderDescriptor } from "emdash/media";
import {
	createCloudinaryProvider,
	type CloudinaryMediaConfig,
	type EnvLookup,
} from "../../web/src/lib/cloudinary-media/provider.ts";

export function createNodeEnvLookup(env: NodeJS.ProcessEnv = process.env): EnvLookup {
	return (name: string): string | undefined => {
		const value = env?.[name];
		return typeof value === "string" && value.length > 0 ? value : undefined;
	};
}

export function createNodeCloudinaryProvider(
	config: CloudinaryMediaConfig = {},
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: typeof fetch = fetch,
	now?: () => number,
): MediaProvider {
	return createCloudinaryProvider(config, createNodeEnvLookup(env), fetchImpl, now);
}

export const createMediaProvider: CreateMediaProviderFn<CloudinaryMediaConfig> = (config) =>
	createNodeCloudinaryProvider(config);

export function cloudinaryMedia(
	config: CloudinaryMediaConfig = {},
): MediaProviderDescriptor<CloudinaryMediaConfig> {
	return {
		id: "cloudinary",
		name: "Cloudinary",
		entrypoint: fileURLToPath(new URL("./cloudinary-media.ts", import.meta.url)),
		capabilities: { browse: true, search: false, upload: true, delete: true },
		config,
	};
}

export { createCloudinaryProvider, type CloudinaryMediaConfig, type EnvLookup };
