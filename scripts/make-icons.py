"""Render the Leen mark to the PNG icons (webOS, PWA, apple-touch, favicon). Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

SS = 4  # supersample

def mark(size, rounded=True, inset=1.0):
    n = size * SS
    k = n / 100
    s = lambda v: (50 + (v - 50) * inset) * k  # scale around the centre (maskable safe zone)
    bgm = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(bgm)
    d.rounded_rectangle((0, 0, n - 1, n - 1), radius=0.26 * n, fill=255) if rounded else d.rectangle((0, 0, n, n), fill=255)
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    im.paste(Image.new("RGBA", (n, n), (0x10, 0x17, 0x22, 255)), (0, 0), bgm)
    # sky-blue play button: triangle expanded by a round 7-unit radius (= 14-wide round-joined stroke in logo.svg)
    tri = [(38, 33), (38, 67), (67, 50)]
    m = Image.new("L", (n, n), 0)
    md = ImageDraw.Draw(m)
    md.polygon([(s(x), s(y)) for x, y in tri], fill=255)
    r = 7 * inset * k
    for (x1, y1), (x2, y2) in zip(tri, tri[1:] + tri[:1]):
        for i in range(101):
            x, y = x1 + (x2 - x1) * i / 100, y1 + (y2 - y1) * i / 100
            md.ellipse((s(x) - r, s(y) - r, s(x) + r, s(y) + r), fill=255)
    c1, c2 = (0xBA, 0xE6, 0xFD), (0x2F, 0x80, 0xED)  # vertical gradient across the tile, like the SVG's bbox gradient
    top, bot = s(26), s(74)
    grad = Image.new("RGB", (n, n))
    gd = ImageDraw.Draw(grad)
    for y in range(n):
        t = max(0.0, min(1.0, (y - top) / (bot - top)))
        gd.line((0, y, n, y), fill=tuple(round(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    im.paste(grad, (0, 0), m)
    return im.resize((size, size), Image.LANCZOS)

for name, size, kw in [
    ("icon.png", 80, {}), ("largeIcon.png", 130, {}),
    ("icon-192.png", 192, {}), ("icon-512.png", 512, {}),
    ("icon-maskable-512.png", 512, {"rounded": False, "inset": 0.7}),
    ("apple-touch-icon.png", 180, {"rounded": False}),
]:
    mark(size, **kw).save(f"public/{name}")
# webOS launch splash (appinfo bgImage/splashBackground): 1920x1080, mark + wordmark on the dark surface
from PIL import ImageFont
bg = Image.new("RGB", (1920, 1080), (0x0E, 0x0F, 0x11))
m = mark(260)
bg.paste(m, ((1920 - 260) // 2, 330), m)
font = None
for f in ("scripts/fonts/kaushan-script-latin-400.woff", "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Medium.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf"):
    try:
        font = ImageFont.truetype(f, 120)
        break
    except OSError:
        pass
d = ImageDraw.Draw(bg)
text = "Leen"
if font:
    w = d.textlength(text, font=font)
    d.text(((1920 - w) / 2, 625), text, font=font, fill=(255, 255, 255, 222))
bg.save("public/splash.png")
print("ok")
