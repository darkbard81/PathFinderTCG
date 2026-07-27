#!/usr/bin/env python

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOURCE_ART_ROOT = PROJECT_ROOT / "assets-source/cards/art"
SOURCE_FRAME_ROOT = PROJECT_ROOT / "assets-source/cards/frames"
RUNTIME_ART_ROOT = PROJECT_ROOT / "public/assets/cards/art"
RUNTIME_FRAME_ROOT = PROJECT_ROOT / "public/assets/ui/cards"

SOURCE_SIZE = (1024, 1536)
RUNTIME_SIZE = (768, 1152)
EXPECTED_ART_COUNT = 32
FRAME_VARIANTS = ("common", "rare", "epic", "legendary")
MAX_ART_BYTES = 1_500_000
MAX_FRAME_BYTES = 2_000_000


class ValidationFailure(Exception):
    pass


def load_image(path: Path) -> Image.Image:
    try:
        with Image.open(path) as candidate:
            candidate.verify()
        image = Image.open(path)
        image.load()
        return image
    except Exception as error:
        raise ValidationFailure(f"{path}: decode failed: {error}") from error


def require_format_and_size(
    path: Path,
    image: Image.Image,
    expected_format: str,
    expected_size: tuple[int, int],
) -> None:
    if image.format != expected_format:
        raise ValidationFailure(
            f"{path}: expected {expected_format}, received {image.format}"
        )
    if image.size != expected_size:
        raise ValidationFailure(
            f"{path}: expected {expected_size[0]}x{expected_size[1]}, "
            f"received {image.width}x{image.height}"
        )


def require_opaque(path: Path, image: Image.Image) -> None:
    if image.mode not in ("RGB", "RGBA"):
        raise ValidationFailure(f"{path}: expected RGB or RGBA, received {image.mode}")
    if image.mode == "RGBA":
        alpha_min, alpha_max = image.getchannel("A").getextrema()
        if alpha_min != 255 or alpha_max != 255:
            raise ValidationFailure(f"{path}: card art must be fully opaque")


def count_visible_chroma(image: Image.Image) -> int:
    rgba = image.convert("RGBA")
    count = 0
    for red, green, blue, alpha in rgba.getdata():
        if alpha <= 16:
            continue
        is_magenta = red >= 245 and green <= 18 and blue >= 245
        is_green = red <= 18 and green >= 245 and blue <= 18
        if is_magenta or is_green:
            count += 1
    return count


def require_transparent_frame(path: Path, image: Image.Image) -> dict[str, float | int]:
    if image.mode != "RGBA":
        raise ValidationFailure(f"{path}: frame must decode as RGBA, received {image.mode}")

    alpha = image.getchannel("A")
    alpha_min, alpha_max = alpha.getextrema()
    if alpha_min != 0 or alpha_max != 255:
        raise ValidationFailure(
            f"{path}: frame alpha must include fully transparent and opaque pixels"
        )

    corner_points = (
        (0, 0),
        (image.width - 1, 0),
        (0, image.height - 1),
        (image.width - 1, image.height - 1),
    )
    if any(alpha.getpixel(point) > 8 for point in corner_points):
        raise ValidationFailure(f"{path}: all four outer corners must be transparent")

    center = alpha.crop(
        (
            image.width // 4,
            image.height // 4,
            image.width * 3 // 4,
            image.height * 3 // 4,
        )
    )
    center_pixels = list(center.getdata())
    center_transparent_ratio = sum(value <= 8 for value in center_pixels) / len(
        center_pixels
    )
    if center_transparent_ratio < 0.80:
        raise ValidationFailure(
            f"{path}: transparent center ratio {center_transparent_ratio:.3f} is below 0.80"
        )

    all_alpha = list(alpha.getdata())
    visible_ratio = sum(value > 16 for value in all_alpha) / len(all_alpha)
    if not 0.02 <= visible_ratio <= 0.45:
        raise ValidationFailure(
            f"{path}: visible frame coverage {visible_ratio:.3f} is outside 0.02..0.45"
        )

    visible_chroma = count_visible_chroma(image)
    if visible_chroma != 0:
        raise ValidationFailure(
            f"{path}: {visible_chroma} visible chroma-key pixels remain"
        )

    return {
        "centerTransparentRatio": round(center_transparent_ratio, 4),
        "visibleRatio": round(visible_ratio, 4),
        "visibleChromaPixels": visible_chroma,
    }


def require_size_limit(path: Path, maximum_bytes: int) -> int:
    file_size = path.stat().st_size
    if file_size > maximum_bytes:
        raise ValidationFailure(
            f"{path}: {file_size} bytes exceeds {maximum_bytes} byte limit"
        )
    return file_size


def validate_art_pair(source_path: Path, runtime_path: Path) -> dict[str, Any]:
    source = load_image(source_path)
    runtime = load_image(runtime_path)
    try:
        require_format_and_size(source_path, source, "PNG", SOURCE_SIZE)
        require_format_and_size(runtime_path, runtime, "WEBP", RUNTIME_SIZE)
        require_opaque(source_path, source)
        require_opaque(runtime_path, runtime)
        return {
            "assetId": source_path.stem,
            "sourceMode": source.mode,
            "runtimeMode": runtime.mode,
            "runtimeBytes": require_size_limit(runtime_path, MAX_ART_BYTES),
        }
    finally:
        source.close()
        runtime.close()


def validate_frame_pair(source_path: Path, runtime_path: Path) -> dict[str, Any]:
    source = load_image(source_path)
    runtime = load_image(runtime_path)
    try:
        require_format_and_size(source_path, source, "PNG", SOURCE_SIZE)
        require_format_and_size(runtime_path, runtime, "WEBP", RUNTIME_SIZE)
        source_metrics = require_transparent_frame(source_path, source)
        runtime_metrics = require_transparent_frame(runtime_path, runtime)
        return {
            "assetId": source_path.stem,
            "source": source_metrics,
            "runtime": runtime_metrics,
            "runtimeBytes": require_size_limit(runtime_path, MAX_FRAME_BYTES),
        }
    finally:
        source.close()
        runtime.close()


def collect_art_paths(root: Path, extension: str) -> dict[str, Path]:
    return {path.stem: path for path in sorted(root.glob(f"*.{extension}"))}


def validate_all(kind: str = "all") -> dict[str, Any]:
    art_results: list[dict[str, Any]] = []
    frame_results: list[dict[str, Any]] = []

    if kind in ("all", "art"):
        art_results = validate_art_assets()
    if kind in ("all", "frames"):
        frame_results = validate_frame_assets()

    return {
        "tool": f"Pillow {Image.__version__}",
        "sourceSize": f"{SOURCE_SIZE[0]}x{SOURCE_SIZE[1]}",
        "runtimeSize": f"{RUNTIME_SIZE[0]}x{RUNTIME_SIZE[1]}",
        "artCount": len(art_results),
        "frameCount": len(frame_results),
        "art": art_results,
        "frames": frame_results,
    }


def validate_art_assets() -> list[dict[str, Any]]:
    source_art = collect_art_paths(SOURCE_ART_ROOT, "png")
    runtime_art = collect_art_paths(RUNTIME_ART_ROOT, "webp")
    if len(source_art) != EXPECTED_ART_COUNT:
        raise ValidationFailure(
            f"{SOURCE_ART_ROOT}: expected {EXPECTED_ART_COUNT} PNG files, "
            f"received {len(source_art)}"
        )
    if source_art.keys() != runtime_art.keys():
        missing_runtime = sorted(source_art.keys() - runtime_art.keys())
        unexpected_runtime = sorted(runtime_art.keys() - source_art.keys())
        raise ValidationFailure(
            "card art source/runtime filenames differ: "
            f"missing runtime={missing_runtime}, unexpected runtime={unexpected_runtime}"
        )

    return [
        validate_art_pair(source_art[asset_id], runtime_art[asset_id])
        for asset_id in sorted(source_art)
    ]


def validate_frame_assets() -> list[dict[str, Any]]:
    frame_results = []
    for variant in FRAME_VARIANTS:
        source_path = SOURCE_FRAME_ROOT / f"frame-{variant}.png"
        runtime_path = RUNTIME_FRAME_ROOT / f"frame-{variant}.webp"
        if not source_path.is_file() or not runtime_path.is_file():
            raise ValidationFailure(
                f"frame-{variant}: expected both {source_path} and {runtime_path}"
            )
        frame_results.append(validate_frame_pair(source_path, runtime_path))

    return frame_results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("all", "art", "frames"), default="all")
    arguments = parser.parse_args()
    try:
        result = validate_all(arguments.kind)
    except ValidationFailure as error:
        print(json.dumps({"status": "FAIL", "error": str(error)}, ensure_ascii=False, indent=2))
        return 1

    print(
        json.dumps(
            {"status": "PASS", **result},
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
