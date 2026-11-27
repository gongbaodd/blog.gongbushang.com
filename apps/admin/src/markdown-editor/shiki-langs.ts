/**
 * Shiki grammars for the editor preview, loaded on demand per fence (GON-249). The public site bundles all 346 languages at
 * build time; the browser only ships what the post corpus uses (counted from the 996 `body_md` values on 2026-11-27) plus a few
 * common extras. Every entry is a dynamic import, so Vite emits one lazy chunk per grammar and a post pays only for its fences.
 * An unknown language falls back to plain text, like the public site's "[Shiki] language doesn't exist" path.
 */
import plantumlGrammar from "shiki-plantuml";

type Grammar = () => Promise<{ default: unknown }>;

const g = {
	bat: () => import("shiki/langs/bat.mjs"),
	c: () => import("shiki/langs/c.mjs"),
	cpp: () => import("shiki/langs/cpp.mjs"),
	csharp: () => import("shiki/langs/csharp.mjs"),
	css: () => import("shiki/langs/css.mjs"),
	dart: () => import("shiki/langs/dart.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	glsl: () => import("shiki/langs/glsl.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	graphql: () => import("shiki/langs/graphql.mjs"),
	groovy: () => import("shiki/langs/groovy.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	ini: () => import("shiki/langs/ini.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	jsx: () => import("shiki/langs/jsx.mjs"),
	kotlin: () => import("shiki/langs/kotlin.mjs"),
	latex: () => import("shiki/langs/latex.mjs"),
	markdown: () => import("shiki/langs/markdown.mjs"),
	powershell: () => import("shiki/langs/powershell.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	razor: () => import("shiki/langs/razor.mjs"),
	rust: () => import("shiki/langs/rust.mjs"),
	shellscript: () => import("shiki/langs/shellscript.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	swift: () => import("shiki/langs/swift.mjs"),
	toml: () => import("shiki/langs/toml.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	wasm: () => import("shiki/langs/wasm.mjs"),
	xml: () => import("shiki/langs/xml.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
	// The public site registers this grammar under the name "PlantUML" (`langAlias: { plantuml: "PlantUML" }`).
	PlantUML: async () => ({ default: plantumlGrammar }),
} satisfies Record<string, Grammar>;

/** Fence info string (lowercased by the caller, except the aliases the site configures) -> grammar key. */
const ALIASES: Record<string, keyof typeof g> = {
	bash: "shellscript",
	sh: "shellscript",
	shell: "shellscript",
	shellscript: "shellscript",
	zsh: "shellscript",
	js: "javascript",
	javascript: "javascript",
	mjs: "javascript",
	ts: "typescript",
	typescript: "typescript",
	rs: "rust",
	rust: "rust",
	py: "python",
	python: "python",
	kt: "kotlin",
	kotlin: "kotlin",
	md: "markdown",
	markdown: "markdown",
	"c#": "csharp",
	cs: "csharp",
	csharp: "csharp",
	batch: "bat",
	bat: "bat",
	cmd: "bat",
	ps1: "powershell",
	powershell: "powershell",
	yml: "yaml",
	yaml: "yaml",
	"c++": "cpp",
	cpp: "cpp",
	plantuml: "PlantUML",
	PlantUML: "PlantUML",
	c: "c",
	C: "c",
	css: "css",
	dart: "dart",
	diff: "diff",
	glsl: "glsl",
	go: "go",
	graphql: "graphql",
	groovy: "groovy",
	html: "html",
	ini: "ini",
	java: "java",
	json: "json",
	jsx: "jsx",
	latex: "latex",
	razor: "razor",
	sql: "sql",
	swift: "swift",
	toml: "toml",
	tsx: "tsx",
	wasm: "wasm",
	xml: "xml",
};

/** Grammar key for a fence language, or undefined (plain text). */
export function resolveGrammarKey(lang: string): keyof typeof g | undefined {
	return ALIASES[lang] ?? ALIASES[lang.toLowerCase()];
}

export async function loadGrammar(key: keyof typeof g): Promise<unknown> {
	return (await g[key]()).default;
}

export const SUPPORTED_GRAMMARS = Object.keys(g) as (keyof typeof g)[];
