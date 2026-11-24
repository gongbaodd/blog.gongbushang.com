/** Config-time entry (safe for astro.config.mjs: no cloudflare:workers import). */
import { fileURLToPath } from "node:url";
import type { MediaProviderDescriptor } from "emdash/media";
import type { CloudinaryMediaConfig } from "./provider";

export function cloudinaryMedia(config: CloudinaryMediaConfig = {}): MediaProviderDescriptor<CloudinaryMediaConfig> {
	return {
		id: "cloudinary",
		name: "Cloudinary",
		entrypoint: fileURLToPath(new URL("./runtime.ts", import.meta.url)),
		capabilities: { browse: true, search: false, upload: true, delete: true },
		config,
	};
}
