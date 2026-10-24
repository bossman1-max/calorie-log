"""
Generate the PWA icons for Calorie Log.

The mark is a tally: four upright strokes crossed by a fifth diagonal, the way a set of
five gets counted in a paper logbook. The uprights are bone, the crossing stroke is ochre,
so the one coloured element is the act of completing a set.

Drawn at 4x and downsampled, because PIL has no antialiased line drawing, and supersampling
is what keeps the diagonal's edges clean.

Run once:  python tools/make_icons.py
"""

from PIL import Image, ImageDraw

INK = (23, 20, 18, 255)       # espresso page
BONE = (237, 230, 220, 255)   # upright strokes
OCHRE = (217, 161, 74, 255)   # the crossing stroke

SS = 4  # supersample factor


def draw_mark(size, pad_ratio, radius_ratio, bg):
    """Render one square icon at `size` px."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if bg:
        r = int(s * radius_ratio)
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=INK)

    # Tally geometry: four uprights spanning the inner box, evenly spaced.
    pad = s * pad_ratio
    box = s - pad * 2
    stroke = box * 0.085
    gap = (box - stroke * 4) / 3
    top = pad + box * 0.12
    bottom = pad + box * 0.88

    for i in range(4):
        x = pad + i * (stroke + gap)
        d.rounded_rectangle(
            [x, top, x + stroke, bottom], radius=stroke / 2, fill=BONE
        )

    # The fifth stroke crosses the other four, low-left to high-right.
    x0, y0 = pad - stroke * 0.5, bottom - box * 0.18
    x1, y1 = pad + box + stroke * 0.5, top + box * 0.18
    w = stroke * 1.15
    d.line([x0, y0, x1, y1], fill=OCHRE, width=int(w))
    # PIL has no round line caps, so cap the ends by hand to match the rounded uprights.
    for cx, cy in ((x0, y0), (x1, y1)):
        d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=OCHRE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    # Maskable-safe padding: iOS and Android both crop, so the mark stays well inside.
    draw_mark(192, 0.26, 0.22, bg=True).save("public/icons/icon-192.png")
    draw_mark(512, 0.26, 0.22, bg=True).save("public/icons/icon-512.png")
    # iOS ignores SVG favicons and applies its own mask, so this one is a plain square.
    draw_mark(180, 0.24, 0.0, bg=True).save("public/icons/apple-touch-icon.png")
    # Browser-tab favicon.
    draw_mark(32, 0.18, 0.18, bg=True).save("public/icons/favicon-32.png")
    print("wrote icon-192, icon-512, apple-touch-icon, favicon-32")


if __name__ == "__main__":
    main()
