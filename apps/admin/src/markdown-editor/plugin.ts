/**
 * `markdown-editor` EmDash plugin (GON-249): a CodeMirror 6 field widget for `posts.body_md`.
 * Native format, because the widget is React. The schema field opts in with `widget: "markdown-editor:markdownEditor"`
 * (one-time step: apps/web/scripts/schema/set-body-widget.mjs). Without that, or if the widget throws, EmDash falls back to
 * its default textarea, so the plugin can never lose content by itself.
 */
import { fileURLToPath } from "node:url";
import { definePlugin, type PluginDescriptor } from "emdash";

export const MARKDOWN_PLUGIN_ID = "markdown-editor";
export const MARKDOWN_WIDGET_NAME = "markdownEditor";
/** The value stored in `_emdash_fields.widget`. */
export const MARKDOWN_WIDGET_ID = `${MARKDOWN_PLUGIN_ID}:${MARKDOWN_WIDGET_NAME}`;
const VERSION = "0.1.0";
const FIELD_WIDGETS = [{ name: MARKDOWN_WIDGET_NAME, label: "Markdown editor", fieldTypes: ["text" as const] }];

export function createPlugin() {
	return definePlugin({
		id: MARKDOWN_PLUGIN_ID,
		version: VERSION,
		admin: { fieldWidgets: FIELD_WIDGETS },
	});
}

export function markdownEditor(): PluginDescriptor {
	return {
		id: MARKDOWN_PLUGIN_ID,
		version: VERSION,
		format: "native",
		entrypoint: fileURLToPath(new URL("./plugin.ts", import.meta.url)),
		adminEntry: fileURLToPath(new URL("./admin.tsx", import.meta.url)),
		fieldWidgets: FIELD_WIDGETS,
	};
}
