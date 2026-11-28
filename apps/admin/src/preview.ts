/**
 * Draft preview for the admin origin (GON-250, GON-247).
 *
 * The EmDash admin "Preview" button opens a relative `/<urlPattern>?_preview=<token>` URL on this origin. EmDash's request
 * middleware verifies the token (`verifyPreviewToken`, secret resolved from the DB) and records the granted content in the
 * request context as `preview = { collection, id }`. These helpers turn that into an authorization decision, so a missing,
 * expired, forged or mismatched token never renders a draft (403).
 */
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { getEmDashEntry, getRequestContext } from "emdash";
import { NOINDEX } from "./robots.ts";

export interface GrantedPreview {
	collection: string;
	id: string;
}

/** True only when a verified token grants access to exactly this collection and entry id. */
export function isPreviewGranted(
	granted: GrantedPreview | undefined | null,
	collection: string,
	entryId: string | undefined | null,
): boolean {
	return Boolean(granted && entryId && granted.collection === collection && granted.id === entryId);
}

export function forbidden(): Response {
	return new Response("Forbidden: missing, expired or mismatched preview token.", {
		status: 403,
		headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": NOINDEX },
	});
}

export interface PreviewView {
	title: string;
	coverUrl?: string;
	bodyHtml: string;
}

let processor: ReturnType<typeof createMarkdownProcessor> | undefined;

/** Plain markdown to HTML (no Shiki/KaTeX plugins: this is a draft check, not the published rendering). */
export async function markdownToHtml(source: string): Promise<string> {
	processor ??= createMarkdownProcessor({ syntaxHighlight: false } as never);
	const p = await processor;
	return (await p.render(source)).code;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Load the draft for `slug` if (and only if) a valid preview token grants it; otherwise return a 403 Response. */
export async function loadPreview(
	collection: "posts" | "podcasts",
	slug: string | undefined,
): Promise<PreviewView | Response> {
	if (!slug) return forbidden();
	const granted = getRequestContext()?.preview;
	if (!granted || granted.collection !== collection) return forbidden();
	const { entry } = await getEmDashEntry(collection, slug);
	if (!entry) return forbidden();
	const data = entry.data as unknown as Record<string, unknown>;
	// The token names the entry by the id the admin sent: its database id (data.id, a ULID) or, in older links, its slug (entry.id).
	const dbId = typeof data.id === "string" ? data.id : undefined;
	if (!isPreviewGranted(granted, collection, entry.id) && !isPreviewGranted(granted, collection, dbId)) return forbidden();
	const title = String(data.title ?? slug);
	if (collection === "posts") {
		const image = data.featured_image as { src?: string; previewUrl?: string } | undefined;
		return {
			title,
			coverUrl: image?.src ?? image?.previewUrl,
			bodyHtml: await markdownToHtml(String(data.body_md ?? "")),
		};
	}
	const text = String(data.description ?? data.summary ?? "");
	const audio = typeof data.audio_url === "string" ? data.audio_url : "";
	return {
		title,
		coverUrl: typeof data.image_url === "string" ? data.image_url : undefined,
		bodyHtml:
			(audio ? `<p><audio controls src="${escapeHtml(audio)}"></audio></p>` : "") +
			(text ? `<p>${escapeHtml(text)}</p>` : ""),
	};
}
