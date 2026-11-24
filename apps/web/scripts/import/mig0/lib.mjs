// Shared helpers for MIG-0 (legacy snapshot and audit).
// Reads the legacy Astro build and source content; writes nothing except through the callers.
//
// LEGACY_ROOT: the legacy checkout holding dist/, src/content/_docs and node_modules.
// Defaults to the main checkout because worktrees have empty submodules and no dist/.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const LEGACY_ROOT =
  process.env.LEGACY_ROOT ?? "/Volumes/MacData/github/blog.gongbushang.com";
export const DIST = join(LEGACY_ROOT, "dist");
export const DOCS = join(LEGACY_ROOT, "src/content/_docs");
export const RESUME_SCRIPT = join(LEGACY_ROOT, "packages/resume/generate-pdfs.mjs");

const PNPM = join(LEGACY_ROOT, "node_modules/.pnpm");

// Same slugger Astro's glob loader uses (astro 7.3.3 depends on github-slugger ^2.0.0).
export async function loadSlugger() {
  const file = join(PNPM, "github-slugger@2.0.0/node_modules/github-slugger/index.js");
  const mod = await import(pathToFileURL(file).href);
  return mod.slug;
}

// Frontmatter parser from the same YAML library the legacy repo resolves.
export function loadYaml() {
  const req = createRequire(join(PNPM, "yaml@2.9.1/node_modules/yaml/package.json"));
  return req("yaml");
}

// Recursively list files under root as POSIX relative paths.
export function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };
  visit(root);
  return out.sort();
}

// Returns { data, body } or null when the file has no frontmatter block.
export function splitFrontmatter(text, yaml) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return { data: yaml.parse(m[1]) ?? {}, raw: m[1] };
}

// Route roles and languages are declared as arrays in generate-pdfs.mjs; read them from there.
export function resumeCombos() {
  const src = readFileSync(RESUME_SCRIPT, "utf8");
  const arr = (name) => {
    const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!m) throw new Error(`cannot find ${name} in generate-pdfs.mjs`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };
  const roles = arr("resumeRoles");
  const langs = arr("resumeLanguages");
  return roles.flatMap((role) => langs.map((language) => ({ role, language })));
}

// Astro glob-loader id for a file under _docs: each path segment slugged, extension dropped,
// trailing /index removed. Mirrors getContentEntryIdAndSlug in astro/dist/content/utils.js.
export function globId(relPath, slugFn) {
  const noExt = relPath.replace(/\.[^./]+$/, "");
  return noExt
    .split("/")
    .map((seg) => slugFn(seg))
    .join("/")
    .replace(/\/index$/, "");
}

// Legacy URL path for a file in dist, as served (directory index files get a trailing slash).
export function distUrl(p) {
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.slice(0, -"index.html".length);
  return "/" + p;
}

export const SKIP = (p) => p.startsWith("_astro/") || p.split("/").some((s) => s.startsWith("_noop"));
