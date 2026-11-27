// Hash of the UMAP input corpus. derive stores it with the layout and re-runs UMAP only when it changes.
import crypto from "node:crypto";

export interface UmapCorpusEntry {
  key: string;
  embeddings: number[];
}

export function computeUmapInputHash(entries: UmapCorpusEntry[]): string {
  const hash = crypto.createHash("sha256");
  const sorted = [...entries].sort((left, right) => left.key.localeCompare(right.key));

  for (const item of sorted) {
    hash.update(item.key);
    hash.update("\0");
    hash.update(item.embeddings.join(","));
    hash.update("\n");
  }

  return hash.digest("hex");
}
