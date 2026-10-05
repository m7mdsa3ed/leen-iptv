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

// the end of a row is a wall: Left/Right never jump into another row while the item has row mates
{
  const shortRail = [0, 1, 2].map((i) => B(80 + i * 220, 200, 200, 300))
  const longRail = Array.from({ length: 12 }, (_, i) => B(80 + i * 220, 600, 200, 300))
  assert.equal(pickIndex(shortRail[2], [...shortRail.slice(0, 2), ...longRail], "right"), -1) // last card of a short rail: used to jump down-right
  assert.equal(pickIndex(shortRail[0], [...shortRail.slice(1), ...longRail], "right") >= 0, true)
  const lastRow: Box[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < (r === 2 ? 2 : 5); c++) lastRow.push(B(100 + c * 220, 200 + r * 340, 200, 300))
  const end = lastRow[lastRow.length - 1]
  assert.equal(pickIndex(end, lastRow.slice(0, -1), "right"), -1) // short last grid row: used to jump up-right
  const hero = [B(80, 300, 160, 48), B(256, 300, 48, 48), B(320, 300, 48, 48)]
  assert.equal(pickIndex(hero[2], [...hero.slice(0, 2), ...longRail], "right"), -1) // last hero button
  // an item alone on its line still enters the pane beside it (settings list -> options)
  assert.equal(pickIndex(B(40, 800, 300, 60), [B(400, 180, 800, 60)], "right"), 0)
  // and a vertical move still always lands somewhere in the next row
  assert.equal(pickIndex(shortRail[2], longRail, "down", 600) >= 0, true)
}

// top bar: the Search button, the tabs and the profile button are one row, so Left/Right walk through all of them
{
  const search = B(120, 24, 180, 48), tabs = [0, 1, 2, 3, 4].map((i) => B(340 + i * 130, 24, 120, 48)), avatar = B(1780, 20, 48, 48)
  const bar = [search, ...tabs, avatar]
  assert.deepEqual(unreachable(bar), [])
  assert.equal(pickIndex(tabs[4], [search, ...tabs.slice(0, 4), avatar], "right"), 5) // last tab -> profile button
  assert.equal(pickIndex(tabs[0], [search, ...tabs.slice(1), avatar], "left"), 0)    // first tab -> Search
  assert.equal(pickIndex(avatar, [search, ...tabs], "right"), -1)
}

// Up/Down never skip a row: a short rail under a far-right card is still the next row (its container spans the anchor), the hero's buttons come before the rails
{
  const { pickIndex, firstRowIndex } = await import("../src/lib/nav-pure.ts")
  const card = (i: number, y: number) => B(80 + i * 220, y, 200, 300)
  const A = Array.from({ length: 12 }, (_, i) => card(i, 100)), S = [0, 1, 2].map((i) => card(i, 500)), C = Array.from({ length: 12 }, (_, i) => card(i, 900))
  const row = (y: number): Box => B(0, y, 1920, 300) // a rail's container spans the screen, its cards may not
  const from = A[7], ax = (from.left + from.right) / 2 // a far-right card, still on screen
  const others = [...A.filter((b) => b !== from), ...S, ...C]
  const ext = [...A.filter((b) => b !== from).map(() => row(100)), ...S.map(() => row(500)), ...C.map(() => row(900))]
  const down = pickIndex(from, others, "down", ax, { ext })
  assert.equal(others[down].top, 500, "Down lands on the short rail, not the long one after it")
  assert.equal(others[down].left, 520, "...on the card nearest the anchor")
  const fromC = C[7], others2 = [...A, ...S, ...C.filter((b) => b !== fromC)]
  const ext2 = [...A.map(() => row(100)), ...S.map(() => row(500)), ...C.filter((b) => b !== fromC).map(() => row(900))]
  assert.equal(others2[pickIndex(fromC, others2, "up", (fromC.left + fromC.right) / 2, { ext: ext2 })].top, 500, "Up skips nothing either")
  // without the row hint (loose controls, a pane beside a list) nothing between counts unless it lines up: the old behaviour
  assert.equal(others[pickIndex(from, others, "down", ax)].top, 900)

  // the A-Z index beside a grid is an aside: it is never the row in between
  const r1 = [0, 1, 2, 3, 4].map((i) => B(100 + i * 220, 200, 200, 300)), r2 = [0, 1, 2, 3, 4].map((i) => B(100 + i * 220, 524, 200, 300))
  const letters = Array.from({ length: 26 }, (_, i) => B(1888, 200 + i * 16, 16, 16))
  const all2 = [...r2, ...letters], aside = all2.map((b) => letters.includes(b))
  assert.ok(r2.includes(all2[pickIndex(r1[4], all2, "down", 1090, { aside })]), "Down from the last column goes to the next card row")

  // Home: Down from the top bar goes to the hero's first control (Watch), whatever tab it starts from; rows under the bar or off screen do not count
  const watch = B(64, 513, 170, 55), plus = B(246, 508, 60, 60), arrows = [B(1640, 551, 60, 60), B(1820, 551, 60, 60)]
  const rail = Array.from({ length: 10 }, (_, i) => B(64 + i * 206, 690, 190, 285)), under = B(300, 40, 100, 40), below = B(64, 2000, 100, 40)
  const page = [under, rail[3], plus, ...arrows, watch, rail[0], below]
  assert.equal(page[firstRowIndex(page, 96, 1080)], watch, "the hero's Watch button, leftmost of the first row")
  assert.equal(page[firstRowIndex(page, 96, 1080, true)], plus, "RTL: the rightmost control on that line")
  assert.equal(firstRowIndex([under], 96, 1080), -1)
}

// a short category sidebar is an aside: Left reaches it from ANY row of the page beside it, not only from rows that overlap its few pills
{
  const { pickIndex } = await import("../src/lib/nav-pure.ts")
  const pills = [0, 1, 2].map((i) => B(40, 150 + i * 50, 200, 44)), cards = [0, 1, 2, 3].map((i) => B(300 + i * 220, 700, 200, 300))
  const all = [...pills, ...cards.slice(1)], aside = all.map((b) => pills.includes(b))
  assert.equal(all[pickIndex(cards[0], all, "left", null, { aside })], pills[2], "Left from the first card of a low row reaches the sidebar")
  assert.equal(pickIndex(cards[0], all, "left"), -1, "(without the flag the row's wall keeps it in)")
}
