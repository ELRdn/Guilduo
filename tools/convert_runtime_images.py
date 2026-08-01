from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]

RUNTIME_IMAGES = [
    "assets/avatar-masc-48.png",
    "assets/avatar-femme-48.png",
    "assets/class-lineup-48.png",
    "assets/class-lineup-femme-48.png",
    "assets/boss-d-transparent.png",
    "assets/boss-e-transparent.png",
    "assets/boss-h-transparent.png",
    "assets/boss-g3-transparent.png",
    "assets/boss-h3-transparent.png",
    "assets/equipment/equipment-cloak-sage.png",
    "assets/equipment/equipment-journal.png",
    "assets/equipment/equipment-gem-brooch.png",
    "assets/equipment/equipment-operator-headset.png",
    "assets/equipment/equipment-ranger-tail.png",
    "assets/equipment/equipment-clockwork-arm.png",
]

RUNTIME_IMAGES.extend(
    f"assets/avatar-role-{prefix}{role}.png"
    for prefix in ("", "femme-")
    for role in ("sentinel", "archivist", "operator", "alchemist", "ranger", "artificer")
)


def main() -> None:
    for relative_path in RUNTIME_IMAGES:
        source = ROOT / relative_path
        target = source.with_suffix(".webp")
        with Image.open(source) as image:
            image.save(target, "WEBP", lossless=True, method=6)
        print(f"{source.name} -> {target.name}")


if __name__ == "__main__":
    main()
