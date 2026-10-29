"""Render the Leen mark (public/logo.svg) to the PNG icons (webOS, PWA, apple-touch, splash) and copy it to favicon.svg. Needs rsvg-convert + ImageMagick. Run: python3 scripts/make-icons.py"""
import shutil, subprocess

SRC = open("public/logo.svg").read()
shutil.copyfile("public/logo.svg", "public/favicon.svg")

def mark(path, size, rounded=True, inset=1.0):
    # inset shrinks the glyph around the tile centre (maskable icons keep it inside the safe circle)
    svg = SRC.replace('<g id="glyph" transform="', f'<g id="glyph" transform="translate(50 50) scale({inset}) translate(-50 -50) ')
    if not rounded: svg = svg.replace('rx="24"', 'rx="0"')
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", path], input=svg.encode(), check=True)

for name, size, kw in [
    ("icon.png", 80, {}), ("largeIcon.png", 130, {}),
    ("icon-192.png", 192, {}), ("icon-512.png", 512, {}),
    ("icon-maskable-512.png", 512, {"rounded": False, "inset": 0.75}),
    ("apple-touch-icon.png", 180, {"rounded": False}),
]:
    mark(f"public/{name}", size, **kw)
# webOS launch splash (appinfo bgImage/splashBackground): 1920x1080, mark centred on the splash background
mark("/tmp/leen-mark.png", 220)
subprocess.run(["convert", "-size", "1920x1080", "xc:#0B0D10", "/tmp/leen-mark.png", "-gravity", "center", "-composite", "public/splash.png"], check=True)
print("ok")
