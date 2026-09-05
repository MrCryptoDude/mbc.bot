#!/usr/bin/env python3
"""
Generates grid thumbnails for the gallery.

The full-size memes are Midjourney/Grok exports — often 1.5-2 MB each — but the
gallery grid renders them in roughly 300px tiles. Without thumbnails a visitor
scrolling the page pulls tens of megabytes to look at postage stamps, which is
slow on mobile data and burns Vercel bandwidth.

Writes website/assets/memes/thumbs/<name>.webp, max 640px on the long edge.
Skips anything already thumbed and still newer than its source, so re-runs are
cheap. Formats PIL cannot open (e.g. AVIF without a plugin) are skipped and the
gallery falls back to the full image for those.

Run directly, or via `npm run memes`, which calls this first.
"""
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Pillow not installed — skipping thumbnails (gallery will use full images).")
    print("  pip install Pillow")
    sys.exit(0)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "website" / "assets" / "memes"
OUT = SRC / "thumbs"
EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
MAX_EDGE = 640
QUALITY = 78

if not SRC.is_dir():
    print(f"No such folder: {SRC}")
    sys.exit(1)

OUT.mkdir(exist_ok=True)

made = skipped = failed = 0
src_bytes = out_bytes = 0

for f in sorted(SRC.iterdir()):
    if not f.is_file() or f.suffix.lower() not in EXT:
        continue
    src_bytes += f.stat().st_size
    dest = OUT / (f.stem + ".webp")

    if dest.exists() and dest.stat().st_mtime >= f.stat().st_mtime:
        out_bytes += dest.stat().st_size
        skipped += 1
        continue

    try:
        with Image.open(f) as im:
            # honour EXIF rotation, flatten alpha onto the page colour so
            # transparent PNGs don't turn into white blocks on the dark grid
            im = ImageOps.exif_transpose(im)
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, (13, 18, 14))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
            im.save(dest, "WEBP", quality=QUALITY, method=6)
        out_bytes += dest.stat().st_size
        made += 1
    except Exception as err:
        print(f"  skip {f.name}: {err}")
        failed += 1

mb = lambda n: f"{n / 1_048_576:.1f} MB"
print(f"Thumbnails: {made} new, {skipped} up to date" + (f", {failed} unreadable" if failed else ""))
if out_bytes:
    print(f"Grid payload {mb(src_bytes)} -> {mb(out_bytes)}")
