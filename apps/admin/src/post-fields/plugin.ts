/**
 * `post-fields` EmDash plugin (GON-269), two jobs for the `posts` collection:
 *
 * 1. A field widget that renders nothing (`post-fields:hidden`). EmDash 1.6.0 has no `hidden` option on a field, so the legacy and seed
 *    fields (`legacy_id`, `legacy_date`, `content`, `excerpt`) opt in with `widget: "post-fields:hidden"` and disappear from the editor
 *    without dropping their columns. The editor still carries their values in its form state and saves them back unchanged.
 *    Schema step: apps/web/scripts/schema/apply.mjs (fresh DBs), apps/web/scripts/schema/set-hidden-widgets.mjs (existing DBs).
 * 2. A `content:beforePublish` policy: a post whose slug is not one valid path segment, or that has no category term, cannot be
 *    published (the slug is the last segment of its public URL and the category is the first; the web build throws on either).
 *    The category is read with `ctx.taxonomies.getEntryTerms` (capability `taxonomies:read`), because the event only carries the entry row. (`content:beforeSave` never sees the slug, so drafts can still be saved with a bad one.)
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type ContentPolicyDecision, type PluginDescriptor } from "emdash";
import { POST_SLUG_RE, isValidPostSlug } from "../../../web/src/lib/post-id.ts";

export const POST_FIELDS_PLUGIN_ID = "post-fields";
export const HIDDEN_WIDGET_NAME = "hidden";
/** The value stored in `_emdash_fields.widget`. */
export const HIDDEN_WIDGET_ID = `${POST_FIELDS_PLUGIN_ID}:${HIDDEN_WIDGET_NAME}`;
const VERSION = "0.1.0";
const FIELD_WIDGETS = [{ name: HIDDEN_WIDGET_NAME, label: "Hidden", fieldTypes: ["string" as const, "text" as const, "portableText" as const] }];

/** Pure policy: undefined to allow, `{ cancel, reason }` to block. Exported for the unit test. */
export function checkPostSlugForPublish(event: { collection: string; content: Record<string, unknown> }): ContentPolicyDecision {
	if (event.collection !== "posts") return;
	const slug = event.content.slug;
	if (isValidPostSlug(slug)) return;
	return {
		cancel: true,
		reason: `The slug ${JSON.stringify(typeof slug === "string" ? slug : "")} cannot be published: it is the last part of the post URL, so it must be one segment of lowercase letters, digits and hyphens, without "/" (${POST_SLUG_RE}). Fix the slug and publish again.`,
	};
}

const NO_CATEGORY = "The post has no category, so it has no URL: pick a category and publish again.";

/** Same as checkPostSlugForPublish, plus the category check. `categories` is the entry's category terms; undefined = unknown (skip). */
export function checkPostForPublish(event: { collection: string; content: Record<string, unknown> }, categories?: unknown[]): ContentPolicyDecision {
	const slugDecision = checkPostSlugForPublish(event);
	if (slugDecision) return slugDecision;
	if (event.collection === "posts" && categories && categories.length === 0) return { cancel: true, reason: NO_CATEGORY };
}

export function createPlugin() {
	return definePlugin({
		id: POST_FIELDS_PLUGIN_ID,
		version: VERSION,
		capabilities: ["hooks.content-policy:register", "taxonomies:read"],
		hooks: {
			"content:beforePublish": async (event, ctx) => {
				const id = typeof event.content.id === "string" ? event.content.id : undefined;
				let categories: unknown[] | undefined;
				if (event.collection === "posts" && id && ctx.taxonomies) {
					categories = await ctx.taxonomies.getEntryTerms("posts", id, { taxonomy: "category" });
				}
				return checkPostForPublish(event, categories);
			},
		},
		admin: { fieldWidgets: FIELD_WIDGETS },
	});
}

export function postFields(): PluginDescriptor {
	return {
		id: POST_FIELDS_PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminEntry: fileURLToPath(new URL("./admin.tsx", import.meta.url)),
		fieldWidgets: FIELD_WIDGETS,
	};
}

export default createPlugin;
