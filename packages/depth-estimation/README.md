# depth-estimation

Python package for monocular depth estimation from photos using [onnx-community/depth-anything-v2-small](https://huggingface.co/onnx-community/depth-anything-v2-small).

## Prerequisites

Install [uv](https://docs.astral.sh/uv/).

## Setup

From the repo root:

```bash
uv sync
```

Or via pnpm:

```bash
pnpm depth:sync
```

On first run, ONNX weights are downloaded from Hugging Face and cached under `~/.cache/huggingface`.

## Usage

### CLI

```bash
uv run --package depth-estimation depth-photo photo.jpg
uv run --package depth-estimation depth-photo photo.jpg --output depth.png
uv run --package depth-estimation depth-photo photo.jpg --model-file onnx/model_fp16.onnx
```

Or via pnpm:

```bash
pnpm depth:photo photo.jpg --output depth.png
```

### Python API

```python
from depth_estimation import estimate_depth

output = estimate_depth("photo.jpg")
print(output)
```

### GPU (optional)

The default dependency is `onnxruntime` (CPU). For CUDA inference, install `onnxruntime-gpu` in your environment and pass `--device cuda`.
