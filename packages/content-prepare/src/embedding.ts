import { getEmbedding } from "post-embedding";
import type { EmbeddingOptions } from "post-embedding";
import type { MetadataEntry } from "./types.ts";

type EmbeddingSource = Pick<
  MetadataEntry,
  "title" | "category" | "tags" | "series" | "city" | "content"
>;

export function buildEmbeddingText(entry: EmbeddingSource): string {
  const lines: string[] = [
    `title: ${entry.title}`,
    `category: ${entry.category.label}`,
  ];

  if (entry.series) {
    lines.push(`series: ${entry.series.label}`);
  }

  if (entry.tags.length > 0) {
    lines.push(`tags: ${entry.tags.map((tag) => tag.label).join(", ")}`);
  }

  if (entry.city && entry.city.length > 0) {
    lines.push(`city: ${entry.city.join(", ")}`);
  }

  lines.push(`content: ${entry.content}`);

  return lines.join("\n");
}

export async function embedMetadata(
  entry: EmbeddingSource,
  options?: EmbeddingOptions,
): Promise<number[]> {
  return getEmbedding(buildEmbeddingText(entry), options);
}
