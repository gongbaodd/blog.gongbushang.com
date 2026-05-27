import crypto from "node:crypto";

/** Keep in sync with `UMAP_2D_CONFIG` in `packages/umap/src/lib.rs`. */
export const UMAP_2D_CONFIG = {
  n_neighbors: 5,
  min_dist: 0.01,
  spread: 2.5,
} as const;

export function computeUmapParamsHash(): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(UMAP_2D_CONFIG))
    .digest("hex");
}
