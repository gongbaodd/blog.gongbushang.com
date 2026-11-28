import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlugin, checkPostSlugForPublish, HIDDEN_WIDGET_ID, postFields } from "./plugin.ts";
import { fields, HiddenField } from "./admin.tsx";

const publish = (slug: unknown, collection = "posts") => checkPostSlugForPublish({ collection, content: { slug } });

describe("post slug policy (content:beforePublish)", () => {
	it("allows imported-style and new slugs", () => {
		for (const slug of ["2015-03-15-threejs", "my-first-post", "a", "2017-09-20-run-with-the-wind-", "2019-02-25-javascript---unsigned-int"]) {
			expect(publish(slug), slug).toBeUndefined();
		}
	});

	it("blocks a slug that is not one lowercase path segment", () => {
		for (const slug of ["a/b", "/lead", "trail/", "Upper", "with space", "-lead", "dot.dot", "ünï", "", null, undefined, 3]) {
			const r = publish(slug);
			expect(r && r.cancel, String(slug)).toBe(true);
			expect(r && r.reason).toContain("slug");
		}
	});

	it("does not require a category (GON-270): the URL has no category segment", async () => {
		const plugin = createPlugin() as unknown as { hooks: Record<string, { handler?: Function } | Function>; capabilities: string[] };
		expect(plugin.capabilities).not.toContain("taxonomies:read");
		const hook = plugin.hooks["content:beforePublish"];
		const handler = (typeof hook === "function" ? hook : hook.handler) as (e: unknown, c: unknown) => Promise<{ cancel?: boolean } | void> | { cancel?: boolean } | void;
		const ev = { collection: "posts", content: { id: "01ABC", slug: "ok" } };
		// The hook never looks up terms: a ctx without `taxonomies` must not matter.
		expect(await handler(ev, {})).toBeUndefined();
		expect(((await handler({ ...ev, content: { id: "01ABC", slug: "Bad/Slug" } }, {})) as { cancel?: boolean }).cancel).toBe(true);
	});

	it("ignores other collections", () => {
		expect(publish("a/b", "podcasts")).toBeUndefined();
	});

	it("registers the hook with the capability it needs", () => {
		const plugin = createPlugin() as unknown as { capabilities: string[]; hooks: Record<string, unknown> };
		expect(plugin.capabilities).toContain("hooks.content-policy:register");
		expect(Object.keys(plugin.hooks)).toContain("content:beforePublish");
	});
});

describe("draft preview path (GON-270)", () => {
	// EmDash builds a preview URL from the collection urlPattern (/{year}/{month}/{day}/{slug}) without the publish date, so it
	// would leave the tokens in the URL. EMDASH_PREVIEW_PATH_PATTERN (read by emdash's preview-url route, inlined at build time) wins
	// over the pattern; getPreviewUrl substitutes {collection} and {id} only, never {slug}.
	const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
	it("astro.config.mjs defines the pattern for every build, with tokens getPreviewUrl can fill", () => {
		const config = read("../../astro.config.mjs");
		expect(config).toContain('"import.meta.env.EMDASH_PREVIEW_PATH_PATTERN": JSON.stringify(PREVIEW_PATH_PATTERN)');
		const pattern = /const PREVIEW_PATH_PATTERN = "([^"]+)"/.exec(config)![1];
		expect(pattern).toBe("/{collection}/{id}");
		expect(pattern.replace(/\{(collection|id)\}/g, "")).not.toMatch(/[{}]/);
	});
	it("/posts/<id> and /podcasts/<id> are served by pages of this app", () => {
		expect(read("../pages/posts/[slug].astro")).toContain('loadPreview("posts"');
		expect(read("../pages/podcasts/[slug].astro")).toContain('loadPreview("podcasts"');
	});
});

describe("hidden field widget", () => {
	it("renders nothing and is exported where EmDash looks for it", () => {
		expect(HiddenField()).toBeNull();
		expect(fields.hidden).toBe(HiddenField);
		expect(HIDDEN_WIDGET_ID).toBe("post-fields:hidden");
	});

	it("is declared for the string, text and portableText fields it hides", () => {
		const types = postFields().fieldWidgets!.flatMap((w) => w.fieldTypes);
		expect(types).toEqual(expect.arrayContaining(["string", "text", "portableText"]));
	});

	it("is registered in the admin config", () => {
		const config = readFileSync(new URL("../../astro.config.mjs", import.meta.url), "utf8");
		expect(config).toMatch(/postFields\(\)/);
	});
});
