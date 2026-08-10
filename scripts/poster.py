"""Draws one gig poster in the MadGigz palette. Reads JSON on stdin, writes PNG
to stdout.

Deliberately typographic rather than photographic: there is no photo of a show
that hasn't happened, and a generated "atmospheric crowd shot" would be a lie
about a gig nobody has played. A poster that is obviously a poster is honest,
and it looks intentional next to a real one instead of looking like a
placeholder nobody replaced.
"""

import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = Path(__file__).resolve().parent.parent / "src" / "app" / "fonts"
BOLD = FONT_DIR / "Galdern-ExtraBold.otf"
MEDIUM = FONT_DIR / "Galdern-Medium.otf"

W, H = 800, 1200
BACKGROUND = (10, 8, 7)
CREAM = (243, 241, 209)
MUTED = (168, 159, 140)


def hex_rgb(value: str):
    value = value.lstrip("#")
    if len(value) != 6:
        return (215, 102, 22)
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def font(path, size):
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default(size)


def wrap(draw, text, fnt, max_width):
    words, lines, line = text.split(), [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def build(spec):
    accent = hex_rgb(spec.get("accent") or "#d76616")
    # Deterministic from the event id, so re-running produces the same poster
    # rather than quietly changing artwork under a show people have seen.
    rnd = int(hashlib.sha256(spec["seed"].encode()).hexdigest(), 16)

    img = Image.new("RGB", (W, H), BACKGROUND)

    # --- Glow: two soft radial washes, drawn large and blurred down. -------
    glow = Image.new("RGB", (W, H), BACKGROUND)
    gd = ImageDraw.Draw(glow)
    for i, (cx, cy, radius, colour) in enumerate(
        [
            (W * (0.25 + (rnd % 5) / 10), H * 0.28, W * 0.55, accent),
            (W * (0.7 - (rnd % 3) / 10), H * 0.72, W * 0.45, (13, 92, 109)),
        ]
    ):
        for step in range(28, 0, -1):
            t = step / 28
            r = radius * t
            blend = tuple(
                int(BACKGROUND[c] + (colour[c] - BACKGROUND[c]) * (1 - t) * 0.55)
                for c in range(3)
            )
            gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=blend)
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(70)), 0.95)

    # --- Diagonal rule pattern, the one graphic flourish. ------------------
    stripes = Image.new("RGB", (W, H), (0, 0, 0))
    sd = ImageDraw.Draw(stripes)
    spacing = 26
    for x in range(-H, W + H, spacing):
        sd.line([(x, 0), (x + H, H)], fill=(26, 22, 20), width=2)
    img = Image.blend(img, Image.blend(img, stripes, 0.5), 0.35)

    draw = ImageDraw.Draw(img)

    margin = 64
    inner = W - margin * 2

    # --- Top rule + category-ish eyebrow ----------------------------------
    draw.line([(margin, 150), (W - margin, 150)], fill=accent, width=3)
    eyebrow = font(MEDIUM, 26)
    draw.text((margin, 104), "MADGIGZ · MADRID", font=eyebrow, fill=accent)

    # --- Title, the loudest thing on the page -----------------------------
    size = 96
    title_font = font(BOLD, size)
    lines = wrap(draw, spec["title"].upper(), title_font, inner)
    while len(lines) > 3 and size > 48:
        size -= 8
        title_font = font(BOLD, size)
        lines = wrap(draw, spec["title"].upper(), title_font, inner)

    artist_font = font(MEDIUM, 44)
    artist_lines = wrap(draw, spec["artist"], artist_font, inner)[:2]

    # Bottom-weighted, like a real gig poster: the block of title + artist sits
    # just above the footer rule rather than floating in the middle, which is
    # what left a dead band across the centre of the first draft.
    date_font = font(BOLD, 50)
    venue_font = font(MEDIUM, 32)
    footer_y = H - margin - 150
    block_height = len(lines) * int(size * 1.02) + 24 + len(artist_lines) * 54
    y = footer_y - 96 - block_height

    for line in lines:
        draw.text((margin, y), line, font=title_font, fill=CREAM)
        y += int(size * 1.02)

    y += 24
    for line in artist_lines:
        draw.text((margin, y), line, font=artist_font, fill=accent)
        y += 54

    draw.line([(margin, footer_y - 40), (W - margin, footer_y - 40)], fill=(60, 52, 46), width=2)
    draw.text((margin, footer_y), spec["date"].upper(), font=date_font, fill=CREAM)
    for line in wrap(draw, spec["venue"], venue_font, inner)[:1]:
        draw.text((margin, footer_y + 66), line, font=venue_font, fill=MUTED)

    # --- Corner mark ------------------------------------------------------
    mark = Path(__file__).resolve().parent.parent / "public" / "logos" / "mgz-mark.png"
    if mark.exists():
        logo = Image.open(mark).convert("RGBA")
        logo.thumbnail((110, 110))
        img.paste(logo, (W - margin - logo.width, H - margin - logo.height), logo)

    return img


spec = json.loads(sys.stdin.read())
build(spec).save(sys.stdout.buffer, format="PNG", optimize=True)
