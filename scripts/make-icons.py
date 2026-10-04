"""Render the Leen mark (public/logo.svg artwork) to the PNG icons (webOS, PWA, apple-touch, splash). Needs rsvg-convert. Run: python3 scripts/make-icons.py"""
import re, subprocess

SRC = open("public/logo.svg").read()
PATH = re.search(r'<path[^>]*/>', SRC).group(0)

def mark(path, size, rounded=True, inset=1.0):
    sc, w, h = 0.577 * inset, 121.3 * 0.577 * inset, 58.9 * 0.577 * inset
    p = re.sub(r'transform="[^"]*"', f'transform="translate({(100 - w) / 2:.2f} {(100 - h) / 2:.2f}) scale({sc:.4f}) translate(-1.7 -1.3)"', PATH)
    svg = SRC.replace(PATH, p).replace('rx="26"', 'rx="26"' if rounded else 'rx="0"')
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", path], input=svg.encode(), check=True)

for name, size, kw in [
    ("icon.png", 80, {}), ("largeIcon.png", 130, {}),
    ("icon-192.png", 192, {}), ("icon-512.png", 512, {}),
    ("icon-maskable-512.png", 512, {"rounded": False, "inset": 0.7}),
    ("apple-touch-icon.png", 180, {"rounded": False}),
]:
    mark(f"public/{name}", size, **kw)
# webOS launch splash (appinfo bgImage/splashBackground): 1920x1080, mark centred on the dark surface
mark("/tmp/leen-mark.png", 360)
subprocess.run(["convert", "-size", "1920x1080", "xc:#0E0F11", "/tmp/leen-mark.png", "-gravity", "center", "-composite", "public/splash.png"], check=True)
print("ok")
