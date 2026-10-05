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

/** Same visual row: the boxes share at least a fifth of the shorter one's height (a sliver of overlap is another row; the hero's Watch button and its carousel arrows overlap by about a third). */
const sameRow = (a: Box, b: Box) => {
  const o = crossOverlap(a, b, true)
  return o > 0 && o >= Math.min(a.bottom - a.top, b.bottom - b.top) * 0.2
}

/** Index of the best candidate in `dir` from `a` (-1 = none). Same as the min of scoreMove, except that a short row that
 *  sits between `a` and a wide aligned target but is not aligned with `a` is not skipped (else a left-aligned chip row
 *  above a full-width list could never be entered from the right, and left again from below).
 *  The end of a row is a wall for Left/Right: while other items share `a`'s row, items on other rows are not candidates
 *  (Right on the last card of a short rail, on the short last row of a grid or on the last hero button used to jump
 *  diagonally into the next row). An item alone on its line may still reach the nearest one in that direction, which is how
 *  a settings list enters its options pane. */
export function pickIndex(a: Box, boxes: Box[], dir: Dir, ax?: number | null, hints?: Hints): number {
  const horiz = dir === "left" || dir === "right"
  const sc = boxes.map((b) => scoreMove(a, b, dir, ax))
  // (an aside, like a short category sidebar, stays reachable from any row of the page beside it)
  if (horiz && boxes.some((b) => sameRow(a, b))) sc.forEach((s, i) => { if (s != null && !sameRow(a, boxes[i]) && !hints?.aside?.[i]) sc[i] = null })
  let best = -1, bs = Infinity
  sc.forEach((s, i) => { if (s != null && s < bs) (best = i), (bs = s) })
  if (best < 0) return -1
  if (!horiz) return nearestRow(a, boxes, sc, best, dir, ax, hints)
  const b = boxes[best]
  const aligned = (c: Box) => crossOverlap(a, c, horiz) >= 0
  if (!aligned(b)) return best
  const T = 2
  let r = -1, rs = Infinity
  boxes.forEach((c, i) => {
    const s = sc[i]
    if (s == null || i === best || s >= rs || aligned(c) || crossOverlap(b, c, horiz) < 0) return
    const between = dir === "right" ? c.left >= a.right - T && c.right <= b.left + T : c.right <= a.left + T && c.left >= b.right - T
    if (between) (r = i), (rs = s)
  })
  return r >= 0 ? r : best
}

/** DOM facts the boxes alone cannot tell: `ext[i]` = the box of the rail / grid / list / form row that candidate i belongs to (null = it stands alone);
 *  `aside[i]` = it sits beside the page, not in it (the A-Z index, a fixed sidebar). */
export type Hints = { ext?: (Box | null)[]; aside?: boolean[] }

/** Up/Down never skip a row: the best-scoring target is only the best way to line up with the anchor. If whole rows lie between the origin and it
 *  (a left-aligned chip row above a full-width list, a short rail under a far-right card), the nearest of those rows wins, and then its best item.
 *  Only rows that belong to this column count: the item overlaps the anchor or the target it would be skipping, or the rail / grid / form row it
 *  belongs to spans the anchor. A separate pane (a settings list beside its options) does not, so vertical moves still stay in their pane; the aside
 *  things never count. */
function nearestRow(a: Box, boxes: Box[], sc: (number | null)[], best: number, dir: Dir, ax?: number | null, hints?: Hints): number {
  const down = dir === "down", T = 2
  const lo = ax ?? a.left, hi = ax ?? a.right
  const under = (b: Box) => Math.min(hi, b.right) - Math.max(lo, b.left) >= 0
  let r = best
  for (let n = 0; n < 8; n++) { // a few rows at most
    const between: number[] = []
    boxes.forEach((c, i) => {
      if (sc[i] == null || i === r || hints?.aside?.[i]) return
      if (!(down ? c.top >= a.bottom - T && c.bottom <= boxes[r].top + T : c.bottom <= a.top + T && c.top >= boxes[r].bottom - T)) return
      const ext = hints?.ext?.[i]
      if (under(c) || Math.min(c.right, boxes[r].right) - Math.max(c.left, boxes[r].left) >= 0 || (ext && under(ext))) between.push(i)
    })
    if (!between.length) break
    let first = between[0]
    for (const i of between) if (down ? boxes[i].top < boxes[first].top : boxes[i].bottom > boxes[first].bottom) first = i
    let pick = first, ps = Infinity
    for (const i of between) if (sameRow(boxes[first], boxes[i]) && sc[i]! < ps) (pick = i), (ps = sc[i]!)
    r = pick
  }
  return r
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

/** Down from the top bar: the first control of the first row on screen under `edge` (the bar's bottom): the topmost box, then the leftmost one on its line
 *  (rightmost in RTL). Boxes below the viewport (`viewH`) or under the bar do not count. -1 = none. */
export function firstRowIndex(boxes: Box[], edge: number, viewH: number, rtl = false): number {
  const idx = boxes.map((_, i) => i).filter((i) => boxes[i].bottom > edge && boxes[i].top < viewH)
  if (!idx.length) return -1
  let top = idx[0]
  for (const i of idx) if (boxes[i].top < boxes[top].top - 2) top = i
  const k = lineStart(idx.map((i) => boxes[i]), boxes[top], rtl)
  return k >= 0 ? idx[k] : top
}

/** Page-stack length after a popstate that landed on history depth `d` with `n` pages stacked. `ours` = back()/reset() already
 *  trimmed the stack. Any other Back (system gesture, browser button) drops exactly one page, even when the browser skipped
 *  entries (Chromium skips entries pushed without a user gesture, e.g. the stack rebuilt from the URL at startup). */
export const popLen = (d: number, n: number, ours: boolean) => (ours || d >= n ? n : Math.max(1, n - 1))
