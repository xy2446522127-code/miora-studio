from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "docs" / "design-reference" / "huahai-final-2026-07-31"
ACTUAL = ROOT / "docs" / "screenshots" / "2026.08.01.1" / "actual-1672x941"
OUTPUT = ROOT / "docs" / "screenshots" / "2026.08.01.1" / "comparisons-1672x941"

PAIRS = [
    ("01-home.png", "01-home.png", "HOME"),
    ("02-project-manager.png", "02-project-manager.png", "PROJECT MANAGER"),
    ("03-smart-canvas.png", "03-smart-canvas.png", "SMART CANVAS"),
    ("04-batch-link.png", "04-batch-link.png", "BATCH LINK"),
    ("05-api-generation.png", "05-api-generation.png", "API GENERATION"),
    ("06-plugin-generation.png", "06-plugin-generation.png", "PLUGIN GENERATION"),
    ("08-results-rail.png", "07-results-rail.png", "RESULTS RAIL"),
    ("09-plugin-center.png", "08-plugin-center.png", "PLUGIN CENTER"),
]


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGB")
    image.thumbnail(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, "#06101d")
    x = (size[0] - image.width) // 2
    y = (size[1] - image.height) // 2
    canvas.paste(image, (x, y))
    return canvas


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    panel_size = (840, 471)
    header = 42
    gap = 12
    for reference_name, actual_name, title in PAIRS:
        reference = contain(Image.open(REFERENCE / reference_name), panel_size)
        actual = contain(Image.open(ACTUAL / actual_name), panel_size)
        output = Image.new("RGB", (panel_size[0] * 2 + gap, panel_size[1] + header), "#020914")
        output.paste(reference, (0, header))
        output.paste(actual, (panel_size[0] + gap, header))
        draw = ImageDraw.Draw(output)
        draw.text((16, 14), f"{title} | REFERENCE", fill="#dff7ff", font=font)
        draw.text((panel_size[0] + gap + 16, 14), f"{title} | IMPLEMENTATION", fill="#dff7ff", font=font)
        output.save(OUTPUT / f"{Path(actual_name).stem}-comparison.png", optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
