import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAGApplicationBuilder, TextLoader } from '@llm-tools/embedjs';
import { pipeline, Tensor } from '@xenova/transformers';
import { BaseEmbeddings } from '@llm-tools/embedjs-interfaces';
import { LanceDb } from '@llm-tools/embedjs-lancedb';

const filePath = join(__dirname, 'raw', 'all.json');

interface IAllData {
  posts: {
    id: string;
    title: string;
    content: string;
    date: string;
    href: string;
  }[];
}

export function loadAllData<T = IAllData>(): T {
  try {
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent) as T;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`Failed to read or parse ${filePath}:`, err);
    throw err;
  }
}

export interface IEmbedData {
  id: string;
  title: string;
  embeded_title: string;
  content: {
    type: 'text' | 'image' | 'video' | 'audio' | 'link';
    text?: string;
    embedded_text?: string;
  }[];
  date: string;
  href: string;
}

export async function buildEmbeddings(): Promise<void> {

  const embeddingModel = new MiniLMEmbeddings();
  const app = await new RAGApplicationBuilder()
    .setEmbeddingModel(embeddingModel)
    .setVectorDatabase(new LanceDb({ path: './lmdb' }))
    .build();

  const { posts } = loadAllData<IAllData>();

  for (const post of posts) {
    await app.addLoader(new TextLoader({ text: post.content }));
  }
  
  console.log("✅ RAG app built with Xenova embeddings");
}

export class MiniLMEmbeddings implements BaseEmbeddings {
  private embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

  async init(): Promise<void> {
    this.embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!this.embedder) {
      throw new Error("MiniLMEmbeddings not initialized. Call init() first.");
    }

    const out: number[][] = [];
    for (const text of texts) {
      // @ts-expect-error - pipeline types don't fully support feature-extraction options
      const result = await this.embedder(text, { pooling: "mean", normalize: true });
      const tensor = result as Tensor;
      out.push(Array.from(tensor.data));
    }
    return out;
  }

  async embedQuery(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error("MiniLMEmbeddings not initialized. Call init() first.");
    }

    // @ts-expect-error - pipeline types don't fully support feature-extraction options
    const result = await this.embedder(text, { pooling: "mean", normalize: true });
    const tensor = result as Tensor;
    return Array.from(tensor.data);
  }

  async getDimensions(): Promise<number> {
    return 384; // all-MiniLM-L6-v2 outputs 384-d vectors
  }
}