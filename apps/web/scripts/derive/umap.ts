// UMAP stage, same semantics as the legacy `.umap-state.json` (metadata-embedding `applyCombinedUmap2D`):
// one layout for the whole corpus (posts + podcast episodes), reused while the sorted-key/embedding hash is unchanged,
// recomputed with the Rust `umap` binary otherwise. The state lives in `derived.umap_state`, not in a file.
import type pg from "pg";
import type { UmapCorpusEntry } from "../../../../packages/metadata-embedding/src/apply-umap.ts";
import { runUmapBinary } from "../../../../packages/metadata-embedding/src/run-umap-binary.ts";
import { corpusHashes, loadUmapState, saveUmapState, type Xy } from "./cache.ts";

export interface UmapResult {
	coordinates: Record<string, Xy>;
	status: "reused" | "recomputed" | "stale" | "skipped";
	count: number;
	seconds: number;
}

export async function resolveUmap(c: pg.Client, corpus: UmapCorpusEntry[]): Promise<UmapResult> {
	const t0 = Date.now();
	const done = (status: UmapResult["status"], coordinates: Record<string, Xy>): UmapResult => ({ coordinates, status, count: corpus.length, seconds: (Date.now() - t0) / 1000 });
	const sorted = [...corpus].sort((a, b) => a.key.localeCompare(b.key));
	if (sorted.length < 2) return done("skipped", {});

	const { inputHash, paramsHash } = corpusHashes(sorted);
	const cached = await loadUmapState(c);
	if (cached && cached.inputHash === inputHash && cached.paramsHash === paramsHash && cached.count === sorted.length) {
		return done("reused", cached.coordinates);
	}

	try {
		const list = await runUmapBinary(sorted.map((e) => e.embeddings));
		if (list.length !== sorted.length) throw new Error(`UMAP returned ${list.length} coordinates for ${sorted.length} embeddings`);
		const coordinates: Record<string, Xy> = {};
		sorted.forEach((e, i) => (coordinates[e.key] = list[i]!));
		await saveUmapState(c, { inputHash, paramsHash, count: sorted.length, coordinates });
		return done("recomputed", coordinates);
	} catch (err) {
		// No Rust binary (e.g. CI without `pnpm umap:build`): keep the previous layout for keys it knows (D10: others are
		// left out of /umap until the next run that can compute it). Never fail the build for it.
		console.warn(`[derive] WARNING: UMAP not recomputed (${(err as Error).message.split("\n")[0]}); reusing the previous layout`);
		const keys = new Set(sorted.map((e) => e.key));
		const prev = Object.fromEntries(Object.entries(cached?.coordinates ?? {}).filter(([k]) => keys.has(k)));
		return done("stale", prev);
	}
}
