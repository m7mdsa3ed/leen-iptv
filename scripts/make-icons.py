"""Render the Leen IPTV mark to the PNG icons (webOS, PWA, apple-touch, favicon). Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

SS = 4  # supersample

def mark(size, rounded=True, inset=1.0):
    n = size * SS
    g = Image.new("RGB", (n, n))
    px = g.load()
    a, b = (0x42, 0x85, 0xF4), (0x7C, 0x4D, 0xFF)
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * n - 2)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    mask = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, n - 1, n - 1), radius=0.24 * n, fill=255) if rounded else d.rectangle((0, 0, n, n), fill=255)
    im.paste(g, (0, 0), mask)
    d = ImageDraw.Draw(im)
    k = n / 100
    s = lambda v: (50 + (v - 50) * inset) * k  # scale around the centre (maskable safe zone)
    w = lambda v: v * inset * k
    d.rounded_rectangle((s(28), s(22), s(42), s(74)), radius=w(7), fill="white")
    d.rounded_rectangle((s(28), s(60), s(74), s(74)), radius=w(7), fill="white")
    tri = [(s(52), s(30)), (s(52), s(52)), (s(72), s(41))]
    d.polygon(tri, fill="white")
    d.line(tri + [tri[0]], fill="white", width=int(w(5)), joint="curve")
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
for f in ("/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Medium.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVuSans-Bold.ttf"):
    try:
        font = ImageFont.truetype(f, 84)
        break
    except OSError:
        pass
d = ImageDraw.Draw(bg)
text = "Leen IPTV"
if font:
    w = d.textlength(text, font=font)
    d.text(((1920 - w) / 2, 640), text, font=font, fill=(255, 255, 255, 222))
bg.save("public/splash.png")
print("ok")
