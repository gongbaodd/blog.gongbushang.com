/**
 * Admin entry of the `markdown-editor` plugin (GON-249). EmDash 1.6.0 reads the `fields` export:
 * `resolvePluginFieldWidget("markdown-editor:markdownEditor")` -> `pluginAdmins["markdown-editor"].fields.markdownEditor`.
 */
import { MarkdownEditorWidget } from "./MarkdownEditor.tsx";

export const fields = {
	markdownEditor: MarkdownEditorWidget,
};
