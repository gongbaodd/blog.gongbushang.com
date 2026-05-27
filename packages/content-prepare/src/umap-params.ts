import crypto from "node:crypto";

/** UMAP hyperparameters passed to the `umap` Rust binary at runtime. */
export const UMAP_2D_CONFIG = {
  n_neighbors: 40,
  min_dist: 0.01,
  spread: 1.0,
} as const;

export function computeUmapParamsHash(): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(UMAP_2D_CONFIG))
    .digest("hex");
}
