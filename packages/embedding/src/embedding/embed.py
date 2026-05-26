import os

import lmstudio as lms

DEFAULT_MODEL = "text-embedding-qwen3-embedding-0.6b"


def get_embedding(text: str, model: str | None = None) -> list[float]:
    model_id = model or os.environ.get("EMBEDDING_MODEL", DEFAULT_MODEL)
    normalized = text.replace("\n", " ")
    handle = lms.embedding_model(model_id)
    result = handle.embed(normalized)
    return list(result) if not isinstance(result, list) else result
