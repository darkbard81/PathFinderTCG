#!/usr/bin/env python3
"""Normalize and validate generated PF2e elf UI nine-patch textures."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class AssetSpec:
    name: str
    size: tuple[int, int]
    content_size: tuple[int, int]
    columns: tuple[int, int, int]
    rows: tuple[int, int, int]


PANEL_SPEC = AssetSpec(
    name="panel",
    size=(384, 384),
    content_size=(376, 376),
    columns=(72, 240, 72),
    rows=(72, 240, 72),
)

CONTROL_SPEC = AssetSpec(
    name="control",
    size=(384, 128),
    content_size=(380, 120),
    columns=(48, 288, 48),
    rows=(24, 80, 24),
)


def alpha_bbox(image: Image.Image, threshold: int = 8) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("image has no visible pixels after chroma removal")
    return bbox


def normalize(source_path: Path, output_path: Path, spec: AssetSpec) -> None:
    with Image.open(source_path) as source:
        source_rgba = source.convert("RGBA")

    cropped = source_rgba.crop(alpha_bbox(source_rgba))
    normalized_content = cropped.resize(spec.content_size, Image.Resampling.LANCZOS)
    normalized = Image.new("RGBA", spec.size, (0, 0, 0, 0))
    offset = (
        (spec.size[0] - spec.content_size[0]) // 2,
        (spec.size[1] - spec.content_size[1]) // 2,
    )
    normalized.alpha_composite(normalized_content, offset)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(output_path, format="PNG", optimize=True)
    validate(output_path, spec)


def validate(path: Path, spec: AssetSpec) -> None:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")

    if rgba.size != spec.size:
        raise ValueError(f"{spec.name}: expected {spec.size}, got {rgba.size}")
    if rgba.getpixel((0, 0))[3] > 8:
        raise ValueError(f"{spec.name}: top-left corner must be transparent")
    if rgba.getpixel((spec.size[0] - 1, spec.size[1] - 1))[3] > 8:
        raise ValueError(f"{spec.name}: bottom-right corner must be transparent")

    center = rgba.getpixel((spec.size[0] // 2, spec.size[1] // 2))
    if center[3] < 250:
        raise ValueError(f"{spec.name}: center must remain opaque")

    if sum(spec.columns) != spec.size[0] or sum(spec.rows) != spec.size[1]:
        raise ValueError(f"{spec.name}: slice dimensions do not match the output size")

    visible_pixels = 0
    magenta_pixels = 0
    for red, green, blue, alpha in rgba.get_flattened_data():
        if alpha > 16:
            visible_pixels += 1
            if red > 200 and green < 90 and blue > 170:
                magenta_pixels += 1

    if visible_pixels == 0:
        raise ValueError(f"{spec.name}: output has no visible pixels")
    if magenta_pixels / visible_pixels > 0.0001:
        raise ValueError(f"{spec.name}: chroma-colored pixels remain in visible content")

    print(
        f"validated {path}: {rgba.width}x{rgba.height}, "
        f"visible={visible_pixels}, center={center}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--panel-input", type=Path, required=True)
    parser.add_argument("--control-input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    normalize(
        args.panel_input,
        args.output_dir / "pf2e-elf-panel-ninepatch.png",
        PANEL_SPEC,
    )
    normalize(
        args.control_input,
        args.output_dir / "pf2e-elf-control-ninepatch.png",
        CONTROL_SPEC,
    )


if __name__ == "__main__":
    main()
