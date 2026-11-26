# PORT-10 (GON-200): content regressions from the MIG-4 diff

Branch `emdash/PORT-10` (from `feat/emdash` 06113427).

## 1. tetris-ai indented list rendered as a code block
Root cause: renderer. The legacy source is `.mdx`. MDX has no indented code, so the 4-space-indented
`- Move A -> picks ...` lines after a blank line are a list. The EmDash body is stored faithfully
(same text); `renderMarkdown` used CommonMark, where that is an indented code block. No importer bug,
no data change.

Fix: `renderMarkdown(src, { mdx })` uses a second processor that disables the micromark `codeIndented`
construct (what MDX does). `prepareBody` returns `mdx: true` for bodies with the `DescriptionImage`
import line (the marker of the legacy `.mdx` posts; prose or an import-less component do not count); the post page passes it through.

Other posts: only 3 posts are `.mdx` (blog-cards, puzzle-game, tetris-ai). blog-cards has indented lines
only inside fences/frontmatter, puzzle-game only frontmatter. Only tetris-ai was affected. puzzle-game
has no JSX marker, so it uses the md processor, which is fine since nothing in it is indented prose.

## 2. postExcerpt
Legacy `excerpt()` returns `""` only when `post.body` is empty, and otherwise `<stripped>...`. A
non-empty body that strips to nothing (image-only, heading-only) gives `"..."` in legacy, for 29 posts.
The ticket's literal rule ("empty after stripping") would have broken those 29 (seen in the diff), so
the rule is: whitespace-only body -> `""`, anything else -> text + `...`. The bank-card post body is
whitespace in EmDash, now gets an empty description (the meta tag is omitted, not `content=""`). Tests added in `content.test.ts`.

## Checks
- `pnpm --filter web exec vitest run`: 38 files, 446 tests passed (new `markdown.test.ts`).
- web build with local Hyperdrive string: exit 0.
- `pnpm --filter web parity`: PASS, 4945/4945.
- `astro check` in apps/web: 0 errors, 0 warnings, 16 hints.
- `E2E_CHROME_CHANNEL=chrome pnpm --filter web test:e2e`: 14 scenarios, 90 steps passed.

## MIG-4 diff (local DB vs legacy `dist`, 995 posts)
OK 852, expected-only 2, warn 0, error 141. Missing files 0. 1 new post.
Error categories: image-missing-or-wrong 141, link-mismatch 2 (both are the same Cloudinary image
rewrite missing locally, in `efficient-your-component-development` and `triplydb`).
Flagged fields: images 141, links 2; visibleH1 0, h1 0, description 0. With the naive "strip then empty"
rule the diff showed description 30 (29 warn regressions), hence the rule above.
Image errors are expected locally (no MIG-2 rewrite). Production was not queried, so "0 image errors on
production" is still open.
