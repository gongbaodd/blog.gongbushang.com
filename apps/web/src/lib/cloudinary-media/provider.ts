import type {
	CreateMediaProviderFn,
	EmbedOptions,
	MediaListOptions,
	MediaProvider,
	MediaProviderItem,
	MediaUploadInput,
	MediaValue,
} from "emdash/media";
import {
	apiBase,
	basicAuth,
	buildDestroyRequest,
	buildUploadRequest,
	deliveryUrl,
	type CloudinaryCredentials,
} from "./sign";

export interface CloudinaryMediaConfig {
	/** Only list/upload under this folder. Default "growgen". */
	folder?: string;
	/** Env var names (defaults CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET). */
	cloudNameEnvVar?: string;
	apiKeyEnvVar?: string;
	apiSecretEnvVar?: string;
	/** Max upload size in bytes (Worker buffers uploads in memory). Default 10 MB. */
	maxBytes?: number;
}

export type EnvLookup = (name: string) => string | undefined;

interface CloudinaryResource {
	public_id: string;
	asset_folder?: string;
	display_name?: string;
	format?: string;
	resource_type?: string;
	bytes?: number;
	width?: number;
	height?: number;
	secure_url?: string;
	context?: { custom?: { alt?: string } };
}

const MIME: Record<string, string> = {
	jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
	webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
};

function mimeOf(r: CloudinaryResource): string {
	const t = r.resource_type ?? "image";
	if (t === "image") return MIME[(r.format ?? "").toLowerCase()] ?? "image/*";
	return `${t}/${r.format ?? "*"}`;
}

/** Testable core: env lookup and fetch are injected. */
export function createCloudinaryProvider(
	config: CloudinaryMediaConfig,
	getEnv: EnvLookup,
	fetchImpl: typeof fetch = fetch,
	now: () => number = () => Math.floor(Date.now() / 1000),
): MediaProvider {
	const folder = (config.folder ?? "growgen").replace(/^\/+|\/+$/g, "");
	const maxBytes = config.maxBytes ?? 10 * 1024 * 1024;

	const need = (envVar: string | undefined, def: string): string => {
		const name = envVar || def;
		const v = getEnv(name);
		if (!v) throw new Error(`Cloudinary: missing ${name}. Set it as a Worker secret or in .dev.vars.`);
		return v;
	};
	const creds = (): CloudinaryCredentials => ({
		cloudName: need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME"),
		apiKey: need(config.apiKeyEnvVar, "CLOUDINARY_API_KEY"),
		apiSecret: need(config.apiSecretEnvVar, "CLOUDINARY_API_SECRET"),
	});

	const toItem = (r: CloudinaryResource, cloudName: string): MediaProviderItem => {
		const name = r.display_name ?? r.public_id.split("/").pop() ?? r.public_id;
		return {
			id: r.public_id,
			filename: r.format ? `${name}.${r.format}` : name,
			mimeType: mimeOf(r),
			size: r.bytes,
			width: r.width,
			height: r.height,
			alt: r.context?.custom?.alt,
			previewUrl: deliveryUrl(cloudName, r.public_id, { width: 400 }),
			meta: { cloudName, publicId: r.public_id, url: deliveryUrl(cloudName, r.public_id) },
		};
	};

	return {
		async list(options: MediaListOptions) {
			const c = creds();
			const p = new URLSearchParams({ prefix: `${folder}/`, max_results: String(options.limit ?? 20), context: "true" });
			if (options.cursor) p.set("next_cursor", options.cursor);
			const res = await fetchImpl(`${apiBase(c.cloudName)}/resources/image/upload?${p}`, {
				headers: { Authorization: basicAuth(c) },
			});
			if (!res.ok) throw new Error(`Cloudinary list failed: ${res.status}`);
			const data = (await res.json()) as { resources: CloudinaryResource[]; next_cursor?: string };
			return { items: data.resources.map((r) => toItem(r, c.cloudName)), nextCursor: data.next_cursor };
		},

		async get(id: string) {
			const c = creds();
			const res = await fetchImpl(`${apiBase(c.cloudName)}/resources/image/upload/${encodeURI(id)}?context=true`, {
				headers: { Authorization: basicAuth(c) },
			});
			if (res.status === 404) return null;
			if (!res.ok) throw new Error(`Cloudinary get failed: ${res.status}`);
			return toItem((await res.json()) as CloudinaryResource, c.cloudName);
		},

		async upload(input: MediaUploadInput) {
			if (input.file.size > maxBytes) throw new Error(`Cloudinary: file exceeds ${maxBytes} bytes`);
			const c = creds();
			const { url, init } = await buildUploadRequest(c, {
				file: input.file,
				filename: input.filename,
				folder,
				alt: input.alt,
				timestamp: now(),
			});
			const res = await fetchImpl(url, init);
			if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status} ${await res.text()}`);
			return toItem((await res.json()) as CloudinaryResource, c.cloudName);
		},

		async delete(id: string) {
			const c = creds();
			const { url, init } = await buildDestroyRequest(c, id, now());
			const res = await fetchImpl(url, init);
			if (!res.ok) throw new Error(`Cloudinary delete failed: ${res.status}`);
		},

		getEmbed(value: MediaValue, options?: EmbedOptions) {
			const cloudName = need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME");
			const build = (o: { width?: number; height?: number; format?: string; quality?: number | string }) =>
				deliveryUrl(cloudName, value.id, o);
			return {
				type: "image" as const,
				src: build({ width: options?.width, height: options?.height, format: options?.format, quality: options?.quality }),
				width: value.width,
				height: value.height,
				alt: value.alt,
				cdnBaseUrl: `https://res.cloudinary.com/${cloudName}/image/upload`,
				getSrc: build,
			};
		},

		getThumbnailUrl(id: string, _mime?: string, options?: { width?: number; height?: number }) {
			return deliveryUrl(need(config.cloudNameEnvVar, "CLOUDINARY_CLOUD_NAME"), id, {
				width: options?.width ?? 400,
				height: options?.height,
			});
		},
	};
}

export type { CreateMediaProviderFn };
