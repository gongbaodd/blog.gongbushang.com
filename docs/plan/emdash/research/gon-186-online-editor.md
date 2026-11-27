# GON-186 follow-up: a VS Code-style online editor for post bodies

Checked: 2026-11-27. Sources: docs.emdashcms.com (react-admin, field-types, llms.txt), installed `emdash` 1.6.0 types in `apps/admin/node_modules/emdash/dist`, npm metadata, plugins.emdashcms.com.

## Answer

Not VS Code itself. Put a **CodeMirror 6** widget on `body_md` inside the admin, with a live preview that calls the site's own Markdown renderer. Monaco would work but is heavier and worse on touch. Skip vscode.dev and code-server.

## 1. What "VS Code online editor" could mean

| Option | Fits? | Why |
|---|---|---|
| (a) Monaco in apps/admin | Technically yes | Same engine as VS Code. About 80 MB unpacked on npm (`monaco-editor` 0.58.0, all languages). Fine in the Docker Node admin, never in the Worker. Poor on touch. |
| (a') CodeMirror 6 in apps/admin | **Yes, recommended** | Smaller, bundles cleanly, better on touch, has a first-class Markdown mode (`@codemirror/lang-markdown` 6.5.2, `@codemirror/view` 6.44.2). |
| (b) vscode.dev / github.dev | No | `body_md` is a `text` field in EmDash (`apps/web/scripts/schema/apply.mjs:46`). Posts live in Supabase after MIG-5 (plan §E3), not in the git submodule. Editing in git would create a second source of truth that must be synced back. |
| (c) code-server | No | Needs an always-on host. No free host is verified here, and the free-plans rule forbids paid tiers. Full VS Code for one textarea is also overkill. |

## 2. Does EmDash 1.6.0 support field widgets?

**Yes, for native (trusted React) plugins.** Docs: https://docs.emdashcms.com/plugins/creating-native-plugins/react-admin/
- The plugin's admin module exports a `fields` map. A schema field sets `widget: "<pluginId>:<name>"`.
- Props: `value`, `onChange(value)`, `label`, `id`, `required`, `options`, `validation`, `minimal`.
- Each widget runs in an error boundary. Field widgets are native-only; sandboxed plugins can't use them.
- **Discrepancy to settle in a spike:** the installed types have `PluginAdminConfig.fieldWidgets` (`types-YTpIfKXX.d.mts:1634`), but the docs say there is no such key and to use the `fields` export. Follow the docs unless the spike shows otherwise.
- Field types (docs, 17): `string, text, url, number, integer, boolean, datetime, select, multiSelect, portableText, image, file, reference, json, slug, repeater, blocks`. No Markdown or code type. `text` accepts `rows`. https://docs.emdashcms.com/reference/field-types/

**Registry:** none found. plugins.emdashcms.com's "recently updated" list has no Markdown, code or editor widget. npm search for `@emdash-cms` and for "emdash markdown/editor" returns only registry and blocks packages. Nothing to reuse.

## 3. Trade-offs

- **Bundle:** the owner's 2–5 MB Monaco estimate is not measured here. A Markdown-only build will be smaller. Measure in the spike. Bundle the editor rather than loading it from a CDN, so no third-party request is made from the admin.
- **Mobile:** Monaco is poor on touch (general knowledge, not checked here). CodeMirror 6 is better. The admin is desktop-first anyway.
- **Preview parity (main risk):** preview must use the same pipeline as the public post. That is `renderMarkdown` in `apps/web/src/lib/markdown.ts` (remark-math, rehype-katex, shiki-plantuml, remark-attributes, Cloudinary rewrite), plus the client-side Mermaid script. `apps/admin/src/cloudinary-media.ts` already imports from `../../web/src`, so the cross-import has precedent.
- **Images:** the admin already runs the Cloudinary media provider. Insert uploads through the EmDash media library. The upload API from a plugin widget is not verified yet. Credit cost is small: a 190 MB batch was about 0.19 of 25 credits (`knowledge.md`, MIG-2). Current usage is about 4.43 of 25 (2026-11-25).
- **Effort (estimate):** spike 1 day; widget, preview, upload and tests 2–3 days.

## 4. Recommendation

**CodeMirror 6 `body_md` field widget in apps/admin, with split preview from the shared `renderMarkdown`.** Bundle it, keep raw Markdown, and keep `body_md` as the stored value. This is a lossless upgrade to D5, not a Portable Text move.

**Follow-up ticket title:** `[ADM] Markdown field widget for body_md (CodeMirror 6 spike)`

**Done when:**
- A native plugin `fields` widget (or the `fieldWidgets` key, whichever 1.6.0 reads) renders for `body_md` in the `apps/admin` Docker build, and `pnpm --filter admin check:secrets` passes.
- Open and save of all 995 posts (992 `.md`, 3 `.mdx`) leaves `body_md` byte-identical.
- Preview of KaTeX, Mermaid, PlantUML and `{.class}` attributes matches the public post for a sample set that includes the 3 MDX posts.
- Image insert goes through the EmDash media library with the Cloudinary provider, with no new paid tier.
- Bundle size is measured and recorded. No CDN loader.
- Desktop is the supported target. Mobile is read-only acceptable.
