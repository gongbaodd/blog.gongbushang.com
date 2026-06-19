from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image

DEFAULT_REPO = "onnx-community/depth-anything-v2-small"
DEFAULT_MODEL_FILE = "onnx/model_quantized.onnx"

IMAGE_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGE_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
MAX_SIZE = 518
SIZE_MULTIPLE = 14


def resolve_model_path(repo_id: str, model_file: str) -> Path:
    model_path = hf_hub_download(repo_id=repo_id, filename=model_file)
    return Path(model_path)


def create_session(model_path: Path, device: str = "cpu") -> ort.InferenceSession:
    providers = ["CPUExecutionProvider"]
    if device == "cuda":
        providers.insert(0, "CUDAExecutionProvider")

    return ort.InferenceSession(str(model_path), providers=providers)


def get_resize_dims(width: int, height: int) -> tuple[int, int]:
    scale = MAX_SIZE / max(width, height)
    new_width = math.ceil(width * scale / SIZE_MULTIPLE) * SIZE_MULTIPLE
    new_height = math.ceil(height * scale / SIZE_MULTIPLE) * SIZE_MULTIPLE
    return new_width, new_height


def preprocess_image(image: Image.Image) -> tuple[np.ndarray, tuple[int, int]]:
    rgb = image.convert("RGB")
    original_size = rgb.size

    resized_width, resized_height = get_resize_dims(*original_size)
    resized = rgb.resize((resized_width, resized_height), Image.BICUBIC)

    array = np.asarray(resized, dtype=np.float32) / 255.0
    array = (array - IMAGE_MEAN) / IMAGE_STD
    tensor = array.transpose(2, 0, 1)[None]
    return tensor, original_size


def postprocess_depth(depth: np.ndarray, original_size: tuple[int, int]) -> Image.Image:
    depth_map = np.squeeze(depth).astype(np.float32)
    depth_min = depth_map.min()
    depth_max = depth_map.max()

    if depth_max > depth_min:
        depth_map = (depth_map - depth_min) / (depth_max - depth_min) * 255.0
    else:
        depth_map = np.zeros_like(depth_map)

    depth_image = Image.fromarray(depth_map.astype(np.uint8), mode="L")
    return depth_image.resize(original_size, Image.BICUBIC)


def estimate_depth(
    image_path: str | Path,
    *,
    output_path: str | Path | None = None,
    repo_id: str = DEFAULT_REPO,
    model_file: str = DEFAULT_MODEL_FILE,
    device: str = "cpu",
) -> Path:
    image_path = Path(image_path)
    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    if output_path is None:
        output_path = image_path.with_name(f"{image_path.stem}-depth.png")
    else:
        output_path = Path(output_path)

    model_path = resolve_model_path(repo_id, model_file)
    session = create_session(model_path, device=device)

    with Image.open(image_path) as image:
        tensor, original_size = preprocess_image(image)

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    depth = session.run([output_name], {input_name: tensor})[0]

    depth_image = postprocess_depth(depth, original_size)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    depth_image.save(output_path)
    return output_path
