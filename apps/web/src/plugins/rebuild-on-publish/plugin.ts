/** Runtime entry: native plugins export `createPlugin`. */
import { env } from "cloudflare:workers";
import { definePlugin } from "emdash";
import { dispatchOnPublish, type DispatchEnv } from "./dispatch";

const read = (name: keyof DispatchEnv): string | undefined => {
	const v = (env as unknown as Record<string, unknown>)[name];
	if (typeof v === "string" && v) return v;
	return typeof process !== "undefined" ? process.env?.[name] : undefined;
};

export function createPlugin() {
	return definePlugin({
		id: "rebuild-on-publish",
		version: "0.1.0",
		capabilities: ["content:read"],
		hooks: {
			"content:afterPublish": async (event, ctx) => {
				const c = event.content;
				await dispatchOnPublish(
					{
						GITHUB_DISPATCH_TOKEN: read("GITHUB_DISPATCH_TOKEN"),
						GITHUB_DISPATCH_REPO: read("GITHUB_DISPATCH_REPO"),
						GITHUB_API_URL: read("GITHUB_API_URL"),
						SITE_ENV: read("SITE_ENV"),
					},
					{
						collection: event.collection,
						id: String(c.id ?? ""),
						slug: typeof c.slug === "string" ? c.slug : undefined,
					},
					ctx.log,
				);
			},
		},
	});
}

export default createPlugin;
