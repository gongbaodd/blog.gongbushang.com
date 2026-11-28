import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlugin, checkPostForPublish, checkPostSlugForPublish, HIDDEN_WIDGET_ID, postFields } from "./plugin.ts";
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

	it("blocks a post with no category term, allows one with a category or an unknown one", () => {
		const event = { collection: "posts", content: { slug: "ok-slug" } };
		const r = checkPostForPublish(event, []);
		expect(r && r.cancel).toBe(true);
		expect(r && r.reason).toContain("no category");
		expect(checkPostForPublish(event, [{ slug: "fe" }])).toBeUndefined();
		expect(checkPostForPublish(event, undefined)).toBeUndefined();
		expect(checkPostForPublish({ collection: "podcasts", content: {} }, [])).toBeUndefined();
	});

	it("the registered hook reads the entry's category terms", async () => {
		const plugin = createPlugin() as unknown as { hooks: Record<string, { handler?: Function } | Function>; capabilities: string[] };
		expect(plugin.capabilities).toContain("taxonomies:read");
		const hook = plugin.hooks["content:beforePublish"];
		const handler = (typeof hook === "function" ? hook : hook.handler) as (e: unknown, c: unknown) => Promise<{ cancel?: boolean } | void>;
		const ctx = (terms: unknown[]) => ({ taxonomies: { getEntryTerms: async () => terms } });
		const ev = { collection: "posts", content: { id: "01ABC", slug: "ok" } };
		expect((await handler(ev, ctx([])))?.cancel).toBe(true);
		expect(await handler(ev, ctx([{ slug: "fe" }]))).toBeUndefined();
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
