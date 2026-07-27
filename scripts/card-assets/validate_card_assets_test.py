from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw


VALIDATOR_PATH = Path(__file__).with_name("validate_card_assets.py")
SPEC = importlib.util.spec_from_file_location("phase4_card_asset_validator", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {VALIDATOR_PATH}")
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class CardAssetValidatorTest(unittest.TestCase):
    def test_accepts_opaque_card_art(self) -> None:
        image = Image.new("RGB", (1024, 1536), (30, 80, 50))
        VALIDATOR.require_opaque(Path("card.png"), image)

    def test_rejects_transparent_card_art(self) -> None:
        image = Image.new("RGBA", (1024, 1536), (30, 80, 50, 255))
        image.putpixel((0, 0), (30, 80, 50, 0))

        with self.assertRaisesRegex(VALIDATOR.ValidationFailure, "fully opaque"):
            VALIDATOR.require_opaque(Path("card.png"), image)

    def test_accepts_a_clean_transparent_frame(self) -> None:
        image = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle(
            (18, 18, 1005, 1517),
            radius=72,
            outline=(154, 121, 68, 255),
            width=44,
        )

        metrics = VALIDATOR.require_transparent_frame(Path("frame.png"), image)

        self.assertGreaterEqual(metrics["centerTransparentRatio"], 0.80)
        self.assertEqual(metrics["visibleChromaPixels"], 0)

    def test_rejects_visible_chroma_inside_a_frame(self) -> None:
        image = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle(
            (18, 18, 1005, 1517),
            radius=72,
            outline=(154, 121, 68, 255),
            width=44,
        )
        draw.rectangle((80, 80, 90, 90), fill=(255, 0, 255, 255))

        with self.assertRaisesRegex(VALIDATOR.ValidationFailure, "chroma-key"):
            VALIDATOR.require_transparent_frame(Path("frame.png"), image)

    def test_decodes_png_and_rejects_the_wrong_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            path = Path(temporary_directory) / "small.png"
            Image.new("RGB", (64, 64), (0, 0, 0)).save(path)
            image = VALIDATOR.load_image(path)
            try:
                with self.assertRaisesRegex(VALIDATOR.ValidationFailure, "expected 1024x1536"):
                    VALIDATOR.require_format_and_size(path, image, "PNG", (1024, 1536))
            finally:
                image.close()


if __name__ == "__main__":
    unittest.main()
