/** Runtime entrypoint loaded by EmDash (`createMediaProvider`). Workers only. */
import { env } from "cloudflare:workers";
import type { CreateMediaProviderFn } from "emdash/media";
import { createCloudinaryProvider, type CloudinaryMediaConfig } from "./provider";

const lookup = (name: string): string | undefined => {
	const v = (env as unknown as Record<string, unknown>)[name];
	if (typeof v === "string" && v) return v;
	return typeof process !== "undefined" ? process.env?.[name] : undefined;
};

export const createMediaProvider: CreateMediaProviderFn<CloudinaryMediaConfig> = (config) =>
	createCloudinaryProvider(config, lookup);
