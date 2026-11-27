// GON-240: the Worker asset handler decodes the request path before it looks up the asset manifest, so `/tag/c%23/` is looked up
// as `/tag/c#/`. Astro writes the C# tag to a directory literally named `c%23`, which the handler never finds (404). After the
// build, rename every percent-encoded entry under dist/client to its decoded name (`c%23` -> `c#`). The public URL stays
// `/tag/c%23/`; spaces and non-ASCII names (`android 14`, `宇宙编辑部`) are already written decoded and are untouched.
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const ENCODED = /%[0-9A-Fa-f]{2}/;

/** Decoded file name for an encoded one, or null when it must stay as it is (not encoded, invalid, or would change the path shape). */
export function decodeAssetName(name) {
	if (!ENCODED.test(name)) return null;
	let out;
	try {
		out = decodeURIComponent(name);
	} catch {
		return null;
	}
	if (out === name || out === "." || out === ".." || /[/\\\0]/.test(out)) return null;
	return out;
}

/** Rename encoded entries under `root` (recursive). Returns [from, to] pairs relative to `root`. Throws if the target already exists. */
export function decodeAssetDirs(root, rel = "") {
	const renamed = [];
	for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
		let relPath = join(rel, e.name);
		const decoded = decodeAssetName(e.name);
		if (decoded) {
			const target = join(rel, decoded);
			if (existsSync(join(root, target))) throw new Error(`[decode-asset-dirs] ${target} already exists; cannot decode ${relPath}`);
			renameSync(join(root, relPath), join(root, target));
			renamed.push([relPath, target]);
			relPath = target;
		}
		if (e.isDirectory()) renamed.push(...decodeAssetDirs(root, relPath));
	}
	return renamed;
}
