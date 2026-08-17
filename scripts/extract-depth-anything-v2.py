#!/usr/bin/env python3
"""Read an image from stdin and write a Depth Anything V2 PNG to stdout."""

from __future__ import annotations

import io
import sys

from PIL import Image

from preprocessors import StructuralPreprocessor


def main() -> int:
    image_bytes = sys.stdin.buffer.read()
    if not image_bytes:
        print("No image bytes received.", file=sys.stderr)
        return 2

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    depth = StructuralPreprocessor().extract_depth(image)
    output = io.BytesIO()
    depth.save(output, format="PNG")
    sys.stdout.buffer.write(output.getvalue())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
