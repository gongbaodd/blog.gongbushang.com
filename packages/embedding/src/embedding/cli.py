import argparse
import json
import sys

from embedding.embed import DEFAULT_MODEL, get_embedding


def main() -> None:
    parser = argparse.ArgumentParser(description="Embed text with LM Studio")
    parser.add_argument(
        "text",
        nargs="?",
        default="Hello, world!",
        help="Text to embed (default: Hello, world!)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Embedding model id (default: {DEFAULT_MODEL})",
    )
    args = parser.parse_args()

    text = args.text
    if text == "-" or (not sys.stdin.isatty() and not args.text):
        text = sys.stdin.read()

    embedding = get_embedding(text, model=args.model)
    print(json.dumps(embedding))


if __name__ == "__main__":
    main()
