"""Generate the favicon and PWA icons from the site's own palette.

AUDIT.md C8: the favicon and logo192/512 were still Create React App's stock
React logo. This draws a serif "M" in candlelight gold on the dark ground —
the same two colours the portfolio and Recollection share, so the tab icon
belongs to the same house as both sites.

    python3 scripts/make-favicon.py
"""
from PIL import Image, ImageDraw, ImageFont

GROUND = (10, 7, 5)        # Recollection --ground (candlelight)
FLAME = (224, 169, 74)     # --gold
SERIF = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def draw_icon(size):
    # Supersample, then downscale — keeps the curves clean at 16px.
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=GROUND)

    # A thin gold rule inside the edge, echoing the site's hairlines.
    inset = max(1, int(s * 0.055))
    d.rounded_rectangle(
        [inset, inset, s - 1 - inset, s - 1 - inset],
        radius=radius - inset,
        outline=FLAME + (70,),
        width=max(1, int(s * 0.012)),
    )

    font = ImageFont.truetype(SERIF, int(s * 0.62))
    box = d.textbbox((0, 0), "M", font=font)
    d.text(
        ((s - (box[2] - box[0])) / 2 - box[0],
         (s - (box[3] - box[1])) / 2 - box[1]),
        "M",
        font=font,
        fill=FLAME,
    )
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    draw_icon(512).save("public/logo512.png")
    draw_icon(192).save("public/logo192.png")
    draw_icon(180).save("public/apple-touch-icon.png")
    # .ico carries several sizes; the browser picks what it needs.
    draw_icon(64).save(
        "public/favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print("wrote favicon.ico, logo192.png, logo512.png, apple-touch-icon.png")
