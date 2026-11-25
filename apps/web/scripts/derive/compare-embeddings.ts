// OWNER-RUN spot check (needs real credentials; not run by CI or by the agents that wrote it):
// cosine similarity between the cached LM Studio vectors (legacy model) and fresh Cloudflare Workers AI vectors for the
// same text. Read-only: nothing is written to the cache. Uses about N * 1 small request (N posts, default 20).
//
//   CF_ACCOUNT_ID=... CF_AI_TOKEN=... pnpm --filter web derive:compare-embeddings -- [N]
//
// Expectation: same underlying model (Qwen3-Embedding-0.6B), so cosine should be about 0.99+ per post. A median below
// ~0.95 means the two paths embed different text or different pooling; do not switch providers until understood.
process.env.TZ ||= "Europe/Tallinn";
import { resolveModel } from "../../../../packages/post-embedding/src/client.ts";
import { embeddingIndex, loadEmbeddings } from "./cache.ts";
import { connect, describeTarget, resolveConnectionString } from "./db.ts";
import { embedBatchWorkersAi, isWorkersAiConfigured } from "./embed-workers-ai.ts";
import { buildPosts, readPosts } from "./posts.ts";
import { loadHints } from "./cache.ts";

const n = Number(process.argv[2] ?? 20);
if (!isWorkersAiConfigured()) {
	console.error("Set CF_ACCOUNT_ID and CF_AI_TOKEN (a Workers-AI-scoped token).");
	process.exit(1);
}
const cosine = (a: number[], b: number[]) => {
	let d = 0, x = 0, y = 0;
	for (let i = 0; i < a.length; i++) {
		d += a[i]! * b[i]!;
		x += a[i]! * a[i]!;
		y += b[i]! * b[i]!;
	}
	return d / Math.sqrt(x * y);
};

const url = resolveConnectionString();
const client = await connect(url);
try {
	const localModel = resolveModel();
	const posts = await buildPosts(await readPosts(client), await loadHints(client));
	const index = await embeddingIndex(client);
	const usable = posts.filter((p) => index.get(p.legacyId)?.model === localModel && index.get(p.legacyId)?.contentHash === p.contentHash);
	console.log(`${describeTarget(url)}: ${usable.length}/${posts.length} posts have a cached ${localModel} vector for the current text`);
	const step = Math.max(1, Math.floor(usable.length / n));
	const sample = usable.filter((_, i) => i % step === 0).slice(0, n);
	const old = await loadEmbeddings(client, new Map(sample.map((p) => [p.legacyId, { contentHash: p.contentHash, model: localModel }])));
	const fresh = await embedBatchWorkersAi(sample.map((p) => p.embeddingText), { batchSize: 8 });
	const sims = sample.map((p, i) => ({ id: p.legacyId, cos: cosine(old.get(p.legacyId)!, fresh[i]!) })).sort((a, b) => a.cos - b.cos);
	for (const s of sims) console.log(s.cos.toFixed(5), s.id);
	const med = sims[Math.floor(sims.length / 2)]!.cos;
	console.log(`n=${sims.length} min=${sims[0]!.cos.toFixed(5)} median=${med.toFixed(5)} max=${sims.at(-1)!.cos.toFixed(5)}`);
} finally {
	await client.end();
}
