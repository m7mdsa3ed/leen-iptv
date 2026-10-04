/* Pure spatial-nav scoring (no DOM, no alias imports) so it can be tested with `node scripts/nav.check.ts`. */
export type Dir = "left" | "right" | "up" | "down"
export type Box = { left: number; right: number; top: number; bottom: number }

/** Pure move score (lower = better, null = not in that direction). `ax` = remembered x centre for vertical moves.
 *  Prefers cross-axis overlap (flat penalty otherwise), then the nearest gap; far jumps cost extra. */
export function scoreMove(a: Box, b: Box, dir: Dir, ax?: number | null): number | null {
  const horiz = dir === "left" || dir === "right"
  const [aLo, aHi, bLo, bHi] = horiz ? [a.top, a.bottom, b.top, b.bottom] : ax != null ? [ax, ax, b.left, b.right] : [a.left, a.right, b.left, b.right]
  const [aMain, bMain] = horiz ? [(a.left + a.right) / 2, (b.left + b.right) / 2] : [(a.top + a.bottom) / 2, (b.top + b.bottom) / 2]
  const sign = dir === "right" || dir === "down" ? 1 : -1
  if ((bMain - aMain) * sign <= 4) return null
  const gap = Math.max(0, dir === "right" ? b.left - a.right : dir === "left" ? a.left - b.right : dir === "down" ? b.top - a.bottom : a.top - b.bottom)
  const overlap = Math.min(aHi, bHi) - Math.max(aLo, bLo)
  const off = Math.abs((bLo + bHi) / 2 - (aLo + aHi) / 2)
  const cross = overlap >= 0 ? off * 0.3 : 400 + -overlap * 3
  return gap + Math.abs(bMain - aMain) * 0.05 + cross + (gap * gap) / 4000
}

const crossOverlap = (x: Box, y: Box, horiz: boolean) => (horiz ? Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) : Math.min(x.right, y.right) - Math.max(x.left, y.left))

/** Index of the best candidate in `dir` from `a` (-1 = none). Same as the min of scoreMove, except that a short row that
 *  sits between `a` and a wide aligned target but is not aligned with `a` is not skipped (else a left-aligned chip row
 *  above a full-width list could never be entered from the right, and left again from below). */
export function pickIndex(a: Box, boxes: Box[], dir: Dir, ax?: number | null): number {
  const horiz = dir === "left" || dir === "right"
  const sc = boxes.map((b) => scoreMove(a, b, dir, ax))
  let best = -1, bs = Infinity
  sc.forEach((s, i) => { if (s != null && s < bs) (best = i), (bs = s) })
  if (best < 0) return -1
  const b = boxes[best]
  const aligned = (c: Box) => (!horiz && ax != null ? ax >= c.left && ax <= c.right : crossOverlap(a, c, horiz) >= 0)
  if (!aligned(b)) return best
  const T = 2
  let r = -1, rs = Infinity
  boxes.forEach((c, i) => {
    const s = sc[i]
    if (s == null || i === best || s >= rs || aligned(c) || crossOverlap(b, c, horiz) < 0) return
    const between = dir === "right" ? c.left >= a.right - T && c.right <= b.left + T : dir === "left" ? c.right <= a.left + T && c.left >= b.right - T : dir === "down" ? c.top >= a.bottom - T && c.bottom <= b.top + T : c.bottom <= a.top + T && c.top >= b.bottom - T
    if (between) (r = i), (rs = s)
  })
  return r >= 0 ? r : best
}

/** Index of the box that starts the visual row `t` sits on (boxes crossing t's vertical centre): the leftmost one, or the
 *  rightmost in RTL. -1 = none. Used when Up/Down enters a new row/group so focus lands on its first item. */
export function lineStart(boxes: Box[], t: Box, rtl = false): number {
  const cy = (t.top + t.bottom) / 2
  let best = -1
  boxes.forEach((b, i) => {
    if (b.top > cy || b.bottom < cy) return
    if (best < 0 || (rtl ? b.right > boxes[best].right : b.left < boxes[best].left)) best = i
  })
  return best
}

/** Page-stack length after a popstate that landed on history depth `d` with `n` pages stacked. `ours` = back()/reset() already
 *  trimmed the stack. Any other Back (system gesture, browser button) drops exactly one page, even when the browser skipped
 *  entries (Chromium skips entries pushed without a user gesture, e.g. the stack rebuilt from the URL at startup). */
export const popLen = (d: number, n: number, ours: boolean) => (ours || d >= n ? n : Math.max(1, n - 1))
