import argparse
import sys

from depth_estimation.depth import (
    DEFAULT_MODEL_FILE,
    DEFAULT_REPO,
    estimate_depth,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Estimate depth from a photo using Depth Anything V2 (ONNX)"
    )
    parser.add_argument("image", help="Path to input photo")
    parser.add_argument(
        "-o",
        "--output",
        help="Output PNG path (default: <stem>-depth.png next to input)",
    )
    parser.add_argument(
        "--repo",
        default=DEFAULT_REPO,
        help=f"Hugging Face repo id (default: {DEFAULT_REPO})",
    )
    parser.add_argument(
        "--model-file",
        default=DEFAULT_MODEL_FILE,
        help=f"ONNX file inside repo (default: {DEFAULT_MODEL_FILE})",
    )
    parser.add_argument(
        "--device",
        choices=["cpu", "cuda"],
        default="cpu",
        help="Inference device (default: cpu)",
    )
    args = parser.parse_args()

    try:
        output_path = estimate_depth(
            args.image,
            output_path=args.output,
            repo_id=args.repo,
            model_file=args.model_file,
            device=args.device,
        )
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(output_path)


if __name__ == "__main__":
    main()
