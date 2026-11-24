/** Native EmDash plugin: content:afterPublish -> GitHub repository_dispatch (D9). Config-time descriptor. */
import { fileURLToPath } from "node:url";
import type { PluginDescriptor } from "emdash";

export function rebuildOnPublish(): PluginDescriptor {
	return {
		id: "rebuild-on-publish",
		version: "0.1.0",
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
	};
}
