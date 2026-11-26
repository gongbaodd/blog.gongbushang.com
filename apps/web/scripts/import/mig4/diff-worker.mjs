// Child process for runBulkDiffIsolated: diffs one batch of post URLs, replies once, then exits.
import { buildRewriteLookup, diffOneUrl } from "./lib.mjs";

process.once("message", ({ config, urls }) => {
  try {
    const lookup = config.rewriteMap ? buildRewriteLookup(config.rewriteMap) : null;
    const results = urls.map((u) => diffOneUrl(u, { ...config, rewriteMap: lookup }));
    process.send({ results });
  } catch (err) {
    process.send({ error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
