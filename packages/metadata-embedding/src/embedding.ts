import { getEmbedding } from "post-embedding";
import type { EmbeddingOptions } from "post-embedding";

export interface PostEmbeddingSource {
  title: string;
  category: { label: string };
  tags: { label: string }[];
  series?: { label: string };
  city?: string[];
  content: string;
}

export function buildPostEmbeddingText(entry: PostEmbeddingSource): string {
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

export function buildPodcastEmbeddingText(entry: {
  title: string;
  summary: string;
}): string {
  return `${entry.title}|podcast|${entry.summary}`;
}

export async function embedFromText(
  text: string,
  options?: EmbeddingOptions,
): Promise<number[]> {
  return getEmbedding(text, options);
}

export async function embedPostMetadata(
  entry: PostEmbeddingSource,
  options?: EmbeddingOptions,
): Promise<number[]> {
  return embedFromText(buildPostEmbeddingText(entry), options);
}
