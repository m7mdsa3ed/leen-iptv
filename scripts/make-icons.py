"""Render the Leen mark to the PNG icons (webOS, PWA, apple-touch, favicon). Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

SS = 4  # supersample

def mark(size, rounded=True, inset=1.0):
    import math
    n = size * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    bgm = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(bgm)
    d.rounded_rectangle((0, 0, n - 1, n - 1), radius=0.26 * n, fill=255) if rounded else d.rectangle((0, 0, n, n), fill=255)
    im.paste(Image.new("RGBA", (n, n), (0x0E, 0x10, 0x20, 255)), (0, 0), bgm)
    k = n / 100
    s = lambda v: (50 + (v - 50) * inset) * k  # scale around the centre (maskable safe zone)
    w = lambda v: v * inset * k

    def stroke(mask, pts, r):  # round-capped, round-joined stroke by stamping circles along the closed path
        md = ImageDraw.Draw(mask)
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
            steps = int(max(abs(x2 - x1), abs(y2 - y1)) * 4) + 1
            for i in range(steps + 1):
                x, y = x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps
                md.ellipse((s(x) - r, s(y) - r, s(x) + r, s(y) + r), fill=255)

    # gradient play-triangle outline
    tri = Image.new("L", (n, n), 0)
    stroke(tri, [(36, 28), (36, 72), (76, 50)], w(4.5))
    grad = Image.new("RGB", (n, n))
    px = grad.load()
    stops = [((0x22, 0xD3, 0xEE), 0.0), ((0xA8, 0x55, 0xF7), 0.55), ((0xF4, 0x72, 0xB6), 1.0)]
    x0, y0, x1, y1 = s(30), s(24), s(80), s(76)
    L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2
    for y in range(n):
        for x in range(n):
            t = max(0.0, min(1.0, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2))
            for (c1, t1), (c2, t2) in zip(stops, stops[1:]):
                if t <= t2:
                    f = (t - t1) / (t2 - t1)
                    px[x, y] = tuple(round(c1[i] + (c2[i] - c1[i]) * f) for i in range(3))
                    break
    im.paste(grad, (0, 0), tri)
    # solid white core
    core = Image.new("L", (n, n), 0)
    cd = ImageDraw.Draw(core)
    cd.polygon([(s(46), s(41)), (s(46), s(59)), (s(61), s(50))], fill=255)
    stroke(core, [(46, 41), (46, 59), (61, 50)], w(2))
    im.paste(Image.new("RGBA", (n, n), (255, 255, 255, 255)), (0, 0), core)
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
text = "Leen"
if font:
    w = d.textlength(text, font=font)
    d.text(((1920 - w) / 2, 640), text, font=font, fill=(255, 255, 255, 222))
bg.save("public/splash.png")
print("ok")
