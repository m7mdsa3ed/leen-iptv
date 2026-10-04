// node scripts/nav.check.ts  -- reachability of every item with the D-pad over synthetic layouts
import assert from "node:assert/strict"
import { pickIndex, type Box, type Dir } from "../src/lib/nav-pure.ts"

const B = (x: number, y: number, w: number, h: number): Box => ({ left: x, top: y, right: x + w, bottom: y + h })
const DIRS: Dir[] = ["left", "right", "up", "down"]

/** BFS with the same anchorX rule as nav.ts (kept across Up/Down, reset on Left/Right). Returns unreachable indexes. */
function unreachable(items: Box[], start = 0) {
  const seen = new Set<number>([start])
  const q: [number, number | null][] = [[start, null]]
  const keySeen = new Set<string>()
  while (q.length) {
    const [i, ax] = q.shift()!
    for (const d of DIRS) {
      const vert = d === "up" || d === "down"
      const a = items[i], anchor = vert ? ax ?? (a.left + a.right) / 2 : null
      const idx = items.map((b, j) => j).filter((j) => j !== i)
      const k = pickIndex(a, idx.map((j) => items[j]), d, anchor)
      if (k < 0) continue
      const j = idx[k]
      seen.add(j)
      const key = `${j}|${vert ? anchor : ""}`
      if (!keySeen.has(key)) (keySeen.add(key), q.push([j, vert ? anchor : null]))
    }
  }
  return items.map((_, i) => i).filter((i) => !seen.has(i))
}

// grid 5x4 with a short last row
const grid: Box[] = []
for (let r = 0; r < 4; r++) for (let c = 0; c < (r === 3 ? 2 : 5); c++) grid.push(B(100 + c * 220, 200 + r * 320, 200, 300))
assert.deepEqual(unreachable(grid), [])

// wide rail: 40 items, most far off-screen to the right
const rail = Array.from({ length: 40 }, (_, i) => B(80 + i * 220, 400, 200, 300))
assert.deepEqual(unreachable(rail), [])
const down = pickIndex(rail[0], rail.slice(1), "right"); assert.equal(down, 0) // next item, not a far one

// tab bar + content: Up from the first rail reaches tabs, Down from tabs reaches content
const tabs = [0, 1, 2, 3, 4].map((i) => B(700 + i * 120, 20, 100, 50))
const content = [...[0, 1, 2, 3, 4, 5].map((i) => B(80 + i * 220, 200, 200, 300)), ...[0, 1, 2, 3, 4, 5].map((i) => B(80 + i * 220, 600, 200, 300))]
const page = [...tabs, ...content]
assert.deepEqual(unreachable(page), [])
assert.equal(pickIndex(content[0], tabs, "up", 180) >= 0, true)
assert.ok(pickIndex(tabs[4], content, "down", 1300) >= 0)

// short chip row (left aligned) between a far-right tab and a full-width list: chips must not be skipped
const chips = [0, 1, 2].map((i) => B(80 + i * 140, 120, 120, 40))
const list = [0, 1, 2].map((i) => B(80, 200 + i * 80, 1700, 70))
const tab = B(1600, 20, 100, 50)
const all = [tab, ...chips, ...list]
assert.deepEqual(unreachable(all), [])
const d = pickIndex(tab, [...chips, ...list], "down", 1650)
assert.ok(d >= 0 && d < chips.length, "Down from a right-hand tab lands on the chip row")

// column list
const col = Array.from({ length: 12 }, (_, i) => B(100, 100 + i * 90, 600, 80))
assert.deepEqual(unreachable(col), [])
assert.equal(pickIndex(col[3], [...col.slice(0, 3), ...col.slice(4)], "down"), 3)

// two panes (sidebar + content with different row heights): vertical moves stay in their pane
const side = [0, 1].map((i) => B(40, 100 + i * 300, 300, 60))
const pane = [B(400, 180, 800, 60), B(400, 500, 800, 60)]
assert.equal(pickIndex(side[0], [side[1], ...pane], "down"), 0)
assert.deepEqual(unreachable([...side, ...pane]), [])

console.log("nav.check ok")

// lineStart: Up/Down into a new row lands on that row's first item (leftmost; rightmost in RTL), not the one under the cursor
{
  const { lineStart } = await import("../src/lib/nav-pure.ts")
  const row2 = Array.from({ length: 6 }, (_, i) => B(-300 + i * 220, 800, 200, 300)) // scrolled rail: item 0 off-screen left
  const other = B(0, 300, 200, 300) // a different line
  assert.equal(lineStart([other, ...row2], row2[3]), 1)
  assert.equal(lineStart([other, ...row2], row2[3], true), 6)
  assert.equal(lineStart([other], row2[0]), -1)
}

// Back pops exactly one page: system/browser Back that skipped history entries (d far below the stack) still drops one level
{
  const { popLen } = await import("../src/lib/nav-pure.ts")
  assert.equal(popLen(2, 3, false), 2) // episode -> detail
  assert.equal(popLen(1, 3, false), 2) // browser skipped the detail entry: still detail, not Shows
  assert.equal(popLen(0, 3, false), 2) // landed on the guard
  assert.equal(popLen(0, 1, false), 1) // root page: stay in the app
  assert.equal(popLen(1, 2, true), 2)  // back() already trimmed the stack
}
