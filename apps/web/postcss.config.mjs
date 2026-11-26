// Tailwind v3 + autoprefixer for the ported public site, scoped to our own CSS.
// The EmDash admin (node_modules/emdash, @emdash-cms/*) ships Tailwind v4 CSS; running v3 over it
// fails with "`@layer base` is used but no matching `@tailwind base`". So CSS from node_modules is skipped.
// This file also stops Vite from walking up to the legacy repo-root postcss.config.mjs (delete the
// root one at CUT-2; this one stays).
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { fileURLToPath } from "node:url";

const inner = postcss([tailwindcss(fileURLToPath(new URL("./tailwind.config.mjs", import.meta.url))), autoprefixer()]);

/** Runs the wrapped pipeline only for CSS that lives outside node_modules. */
const scopedTailwind = () => ({
	postcssPlugin: "scoped-tailwind-v3",
	async Once(root, { result }) {
		const from = result.opts.from ?? "";
		if (!from || from.includes("node_modules")) return;
		await inner.process(root, { from });
	},
});
scopedTailwind.postcss = true;

export default { plugins: [scopedTailwind()] };
