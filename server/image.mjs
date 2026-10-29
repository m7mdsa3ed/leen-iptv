// Artwork resizing for the proxy: /p?url=<encoded>&w=<width>. A TV decodes every poster it paints, and panels often serve 2000px
// originals, so a card-sized copy is fetched here instead of the full image.
// Anything that is not a raster poster (JPEG/PNG/WebP) is streamed through untouched: SVG and AVIF are passed as they are, and a
// non-image answer is left to the plain proxy, so a dead panel link still fails exactly as it did before.
import { createHash } from "node:crypto"
import { mkdir, stat } from "node:fs/promises"
import path from "node:path"

const WIDTHS = [96, 160, 342, 500, 780, 1280] // the sizes cards actually ask for; anything else snaps up to one of these
const MAX_EDGE = 4000 // a bigger source is never re-encoded: not a poster
const MAX_BYTES = 12 * 1024 * 1024
const CACHE_MAX = 400 // files kept on disk
const CACHE_DIR = process.env.LEEN_IMG_CACHE || path.join(process.env.XDG_CACHE_HOME || "/tmp", "leen-img")

/** The width to resize to, or undefined when the request is not a resize (no `w`, or unusable). */
export const imageWidth = (raw) => {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return WIDTHS.find((w) => w >= n) ?? WIDTHS[WIDTHS.length - 1]
}

const TYPES = /^image\/(jpeg|jpg|png|webp)$/i
const keyOf = (url, w) => createHash("sha1").update(`${w}|${url}`).digest("hex")

let sharp
/** sharp is optional: without it (a bare checkout, or a platform with no prebuilt binary) the proxy streams originals. */
async function encoder() {
  if (sharp !== undefined) return sharp
  try { sharp = (await import("sharp")).default } catch { sharp = null }
  return sharp
}

/** Serve `res` an image at `w` pixels wide. Returns false when it did not handle the response (caller streams it normally). */
export async function writeResized({ res, url, width, CORS, headers }) {
  const lib = await encoder()
  if (!lib) return false
  await mkdir(CACHE_DIR, { recursive: true }).catch(() => undefined)
  const file = path.join(CACHE_DIR, `${keyOf(url, width)}.img`)
  // every cached copy is a JPEG we encoded, so the hit needs no metadata pass - just its size on disk
  const hit = await stat(file).catch(() => null)
  if (hit) {
    res.writeHead(200, { ...CORS, "content-type": "image/jpeg", "content-length": String(hit.size), "x-leen-img": "hit", "cache-control": "public, max-age=2592000" })
    lib(file).pipe(res).on("error", () => res.destroy())
    return true
  }
  let up
  try {
    up = await fetch(encodeURI(decodeURI(url)), { headers, redirect: "follow" })
  } catch { return false }
  if (!up.ok || !TYPES.test(up.headers.get("content-type") || "")) return false // not a raster poster: plain proxy handles it
  const len = Number(up.headers.get("content-length") || 0)
  if (len > MAX_BYTES) return false
  const buf = Buffer.from(await up.arrayBuffer())
  if (buf.length > MAX_BYTES) return false
  let out
  try {
    const img = lib(buf, { limitInputPixels: MAX_EDGE * MAX_EDGE })
    const meta = await img.metadata()
    if (!meta.width || !meta.height) return false
    if (meta.width <= width && buf.length < 400 * 1024) return false // already small: the original is cheaper than a re-encode
    out = await img.resize({ width: Math.min(width, meta.width), withoutEnlargement: true, fit: "inside" }).jpeg({ quality: 78, mozjpeg: true, progressive: true }).toBuffer()
  } catch { return false }
  void lib(out).toFile(file).catch(() => undefined) // store as encoded bytes: written for the next request, not awaited
  void prune()
  res.writeHead(200, { ...CORS, "content-type": "image/jpeg", "content-length": String(out.length), "x-leen-img": "miss", "cache-control": "public, max-age=2592000" })
  res.end(out)
  return true
}

let pruning = false
/** Keep the folder bounded: delete the oldest 30% once there are more than CACHE_MAX files. Best effort, once at a time. */
async function prune() {
  if (pruning) return
  pruning = true
  try {
    const { readdir, unlink } = await import("node:fs/promises")
    const names = await readdir(CACHE_DIR)
    if (names.length <= CACHE_MAX) return
    const files = await Promise.all(names.map(async (n) => ({ n, at: await stat(path.join(CACHE_DIR, n)).then((s) => s.mtimeMs, () => 0) })))
    files.sort((a, b) => a.at - b.at)
    await Promise.all(files.slice(0, Math.ceil(files.length * 0.3)).map((f) => unlink(path.join(CACHE_DIR, f.n)).catch(() => undefined)))
  } catch { /* cache pruning is best effort */ } finally { pruning = false }
}
