# embedding

Python package for generating text embeddings via the [LM Studio Python SDK](https://lmstudio.ai/docs/python/embedding).

## Prerequisites

1. Install [uv](https://docs.astral.sh/uv/).
2. Start LM Studio or `llmster` locally (the SDK talks to the local LM Studio server).
3. Download the embedding model:

```bash
lms get nomic-ai/nomic-embed-text-v1.5
```

## Setup

From the repo root:

```bash
uv sync
```

Or via pnpm:

```bash
pnpm embedding:sync
```

## Usage

### Python API

```python
import lmstudio as lms

model = lms.embedding_model("nomic-embed-text-v1.5")
embedding = model.embed("Hello, world!")
```

Or use the package wrapper:

```python
from embedding import get_embedding

vector = get_embedding("Hello, world!")
print(len(vector))
```

Override the model with the `EMBEDDING_MODEL` environment variable or the `model` argument.

### CLI

```bash
uv run --package embedding embed-text "Hello, world!"
```

Embed from stdin:

```bash
echo "Hello, world!" | uv run --package embedding embed-text -
```

### Quick verify

```bash
uv run --package embedding python -c "
import lmstudio as lms
model = lms.embedding_model('nomic-embed-text-v1.5')
print(len(model.embed('Hello, world!')))
"
```

Or:

```bash
pnpm embedding:hello
```
