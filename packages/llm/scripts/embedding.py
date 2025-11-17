from pathlib import Path
from langchain_text_splitters import RecursiveCharacterTextSplitter
import base64
import json
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import text
import brotli


RAW_POSTS_PATH = Path("raw/all.json")
POSTS_RECORDS_PATH = Path("posts_records.jsonl")
POSTS_RECORDS_COMPRESSED_PATH = Path("posts_records_compressed.jsonl.br")
MODEL_PATH = Path("./universal_sentence_encoder.tflite")

BaseOptions = mp.tasks.BaseOptions
TextEmbedderOptions = mp.tasks.text.TextEmbedderOptions
TextEmbedder = mp.tasks.text.TextEmbedder

options = TextEmbedderOptions(
    base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
    quantize=False,
)


text_embedder = TextEmbedder.create_from_options(options)

text_splitter = RecursiveCharacterTextSplitter(
    separators=["\n\n", "\n", " ", ""],
    chunk_size=100,
    chunk_overlap=20,
    length_function=len,
    is_separator_regex=False,
)


def load_posts(path: Path):
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return data.get("posts", [])


def save_chunks_with_embeddings(chunks_list, embedder):
    serialized_records = []

    for idx, chunk in enumerate(chunks_list):
        embedding_result = embedder.embed(chunk)
        embedding = embedding_result.embeddings[0]
        if getattr(embedding, "float_embedding", None) is not None:
            embedding_vector = embedding.float_embedding
        elif getattr(embedding, "embedding", None) is not None:
            embedding_vector = embedding.embedding
        else:
            embedding_vector = embedding.quantized_embedding

        embedding_payload = np.asarray(embedding_vector, dtype=np.float32)
        embedding_payload = embedding_payload.astype(np.float16)
        embedding_buffer = base64.b64encode(embedding_payload.tobytes()).decode(
            "ascii"
        )

        serialized_records.append(
            {
                "chunk_index": idx,
                "chunk": chunk,
                "embedding_result_float16": {
                    "dtype": "float16",
                    "shape": list(embedding_payload.shape),
                    "buffer_b64": embedding_buffer,
                },
            }
        )

    return serialized_records


def iter_post_records(posts, splitter, embedder):
    for post in posts:
        content = post.get("content", "")
        if not content:
            continue

        chunks = splitter.split_text(content)
        records = save_chunks_with_embeddings(chunks, embedder)
        yield {
            "id": post.get("id"),
            "records": records,
        }


def write_jsonl(records_iterable, destination: Path):
    with destination.open("w", encoding="utf-8") as file:
        for record in records_iterable:
            file.write(json.dumps(record, ensure_ascii=False) + "\n")

def write_jsonl_compressed(source: Path, destination: Path):
    with source.open("rb") as f:
        decompressed = f.read()

    compressed = brotli.compress(decompressed)

    with destination.open("wb") as file:
        file.write(compressed)

def main():
    posts = load_posts(RAW_POSTS_PATH)
    write_jsoonl(
        iter_post_records(posts, text_splitter, text_embedder),
        POSTS_RECORDS_PATH,
    )
    write_jsonl_compressed(POSTS_RECORDS_PATH, POSTS_RECORDS_COMPRESSED_PATH)


if __name__ == "__main__":
    main()