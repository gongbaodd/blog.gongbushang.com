/** MIG-6 catch-up: pure helpers (diff parsing, classification, image guard). */

const POST_RE = /^_docs\/(.+\.mdx?)$/i;

/** Parse `git diff --name-status -M` output into { status, path, from? } rows (posts under _docs only). */
export function parseNameStatus(out) {
  const rows = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [st, a, b] = line.split("\t");
    const code = st[0];
    if (code === "R" || code === "C") {
      const to = POST_RE.exec(b ?? "")?.[1];
      const from = POST_RE.exec(a ?? "")?.[1];
      if (code === "R") {
        if (to && from) rows.push({ status: "renamed", path: to, from });
        else if (to) rows.push({ status: "added", path: to });
        else if (from) rows.push({ status: "deleted", path: from });
      } else if (to) rows.push({ status: "added", path: to });
      continue;
    }
    const p = POST_RE.exec(a ?? "")?.[1];
    if (!p) continue;
    if (code === "A") rows.push({ status: "added", path: p });
    else if (code === "M" || code === "T") rows.push({ status: "modified", path: p });
    else if (code === "D") rows.push({ status: "deleted", path: p });
  }
  return rows;
}

/** Group rows by status. Paths are relative to _docs. */
export function classify(rows) {
  const out = { added: [], modified: [], deleted: [], renamed: [] };
  for (const r of rows) out[r.status].push(r);
  for (const k of Object.keys(out)) out[k].sort((x, y) => x.path.localeCompare(y.path));
  return out;
}

/** Posts that must be imported: added, modified, and the new side of renames. */
export function importable(c) {
  return [...c.added, ...c.modified, ...c.renamed].map((r) => r.path);
}

/** Legacy id used by the importer (`globId`): path without extension, `/index` stripped. Slug rules are the importer's. */
export function legacyIdOf(path) {
  return path.replace(/\.[^./]+$/, "").replace(/\/index$/, "");
}

/** Image URLs referenced by a post (frontmatter cover + markdown/HTML images). */
export function imageRefs(text) {
  const refs = new Set();
  const m = text.match(/^\s*(---|\+\+\+)\r?\n([\s\S]*?)\r?\n\1/);
  const fm = m ? m[2] : "";
  const body = m ? text.slice(m[0].length) : text;
  const cover = fm.match(/^cover:[ \t]*(.*)\n((?:[ \t]+.*\n?)*)/m);
  if (cover) {
    const inline = cover[1].trim().replace(/^["']|["']$/g, "");
    if (inline && !inline.startsWith("{")) refs.add(inline);
    for (const u of (cover[1] + "\n" + cover[2]).matchAll(/\burl:[ \t]*["']?([^"'\s,}]+)/g)) refs.add(u[1]);
  }
  for (const u of body.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)) refs.add(u[1]);
  for (const u of body.matchAll(/<(?:img|source|video)\b[^>]*?\b(?:src|poster)=["']([^"']+)["']/gi)) refs.add(u[1]);
  for (const u of body.matchAll(/^\[[^\]]+\]:\s*(\S+\.(?:png|jpe?g|gif|webp|avif|svg))\s*$/gim)) refs.add(u[1]);
  return [...refs];
}

export const isCloudinary = (u) => /^https:\/\/res\.cloudinary\.com\//.test(u);

/** Image guard: `files` = [{ path, text }]; returns [{ path, url }] for every non-Cloudinary image. */
export function offCloudinary(files) {
  const bad = [];
  for (const f of files) for (const url of imageRefs(f.text)) if (!isCloudinary(url)) bad.push({ path: f.path, url });
  return bad;
}
