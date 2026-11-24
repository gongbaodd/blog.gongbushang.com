/**
 * Cloudinary request signing and request building. Pure functions plus Web Crypto,
 * so it runs on Workers (no Node SDK). Docs: Cloudinary "Authentication signatures".
 */

/** Params that are never part of the signature. */
const UNSIGNED = new Set(["file", "cloud_name", "resource_type", "api_key"]);

export type SignParams = Record<string, string | number | boolean | undefined | null>;

/** `a=1&b=2` over sorted, non-empty, signable params. */
export function stringToSign(params: SignParams): string {
	return Object.keys(params)
		.filter((k) => !UNSIGNED.has(k))
		.filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
		.sort()
		.map((k) => `${k}=${String(params[k])}`)
		.join("&");
}

function toHex(buf: ArrayBuffer): string {
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-1 hex of `stringToSign(params) + apiSecret`. */
export async function signParams(params: SignParams, apiSecret: string): Promise<string> {
	const data = new TextEncoder().encode(stringToSign(params) + apiSecret);
	return toHex(await crypto.subtle.digest("SHA-1", data));
}

/** Escape a value inside Cloudinary's `context` string (`k=v|k2=v2`). */
export function escapeContextValue(v: string): string {
	return v.replace(/([=|\\])/g, "\\$1");
}

export interface CloudinaryCredentials {
	cloudName: string;
	apiKey: string;
	apiSecret: string;
}

export function apiBase(cloudName: string): string {
	return `https://api.cloudinary.com/v1_1/${cloudName}`;
}

export function basicAuth(c: CloudinaryCredentials): string {
	return `Basic ${btoa(`${c.apiKey}:${c.apiSecret}`)}`;
}

export interface UploadRequestInput {
	file: Blob;
	filename: string;
	folder?: string;
	alt?: string;
	timestamp: number;
}

/** Build the signed multipart upload request (`/auto/upload`). */
export async function buildUploadRequest(
	c: CloudinaryCredentials,
	input: UploadRequestInput,
): Promise<{ url: string; init: RequestInit }> {
	const signed: SignParams = {
		folder: input.folder,
		timestamp: input.timestamp,
		unique_filename: true,
		use_filename: true,
		context: input.alt ? `alt=${escapeContextValue(input.alt)}` : undefined,
	};
	const signature = await signParams(signed, c.apiSecret);
	const form = new FormData();
	form.append("file", input.file, input.filename);
	form.append("api_key", c.apiKey);
	form.append("signature", signature);
	for (const [k, v] of Object.entries(signed)) {
		if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
	}
	return { url: `${apiBase(c.cloudName)}/auto/upload`, init: { method: "POST", body: form } };
}

/** Build the signed destroy request. */
export async function buildDestroyRequest(
	c: CloudinaryCredentials,
	publicId: string,
	timestamp: number,
	resourceType = "image",
): Promise<{ url: string; init: RequestInit }> {
	const signed: SignParams = { public_id: publicId, timestamp, invalidate: true };
	const signature = await signParams(signed, c.apiSecret);
	const body = new URLSearchParams({
		public_id: publicId,
		timestamp: String(timestamp),
		invalidate: "true",
		api_key: c.apiKey,
		signature,
	});
	return {
		url: `${apiBase(c.cloudName)}/${resourceType}/destroy`,
		init: { method: "POST", body },
	};
}

/** Delivery URL with `f_auto,q_auto` plus optional transforms. */
export function deliveryUrl(
	cloudName: string,
	publicId: string,
	opts: { width?: number; height?: number; format?: string; quality?: number | string } = {},
): string {
	const t: string[] = [];
	if (opts.width || opts.height) t.push("c_fill");
	if (opts.width) t.push(`w_${opts.width}`);
	if (opts.height) t.push(`h_${opts.height}`);
	t.push(`f_${opts.format && opts.format !== "auto" ? opts.format : "auto"}`);
	t.push(`q_${opts.quality ?? "auto"}`);
	return `https://res.cloudinary.com/${cloudName}/image/upload/${t.join(",")}/${publicId}`;
}
