import assert from "node:assert/strict"
import { markSegs, mergeSegs, setMark, skipTo, type PSeg } from "../src/player/skip-pure.ts"

// marks: credits are stored relative to the end, so a longer episode moves them
assert.deepEqual(markSegs({ is: 30, ie: 110, ce: 120 }, 2700), [{ kind: "intro", start: 30, end: 110 }, { kind: "credits", start: 2580, end: 2700 }])
assert.deepEqual(markSegs({ is: 30, ie: 110, ce: 120 }, 0), [{ kind: "intro", start: 30, end: 110 }])
assert.deepEqual(markSegs({ is: 110, ie: 30 }, 2700), [])
// layers: first layer wins per kind; a known intro (from any layer) drops the fallback jump
const own: PSeg[] = [{ kind: "intro", start: 1, end: 2 }]
const mine: PSeg[] = [{ kind: "intro", start: 9, end: 99 }, { kind: "credits", start: 2580, end: 2700 }]
assert.deepEqual(mergeSegs(own, mine), [own[0], mine[1]])
assert.deepEqual(mergeSegs([], []).map((x) => x.kind), ["jump"])
assert.deepEqual(mergeSegs([], [{ kind: "credits", start: 5, end: 9 }]).map((x) => x.kind), ["credits", "jump"])
assert.equal(skipTo({ kind: "jump", start: 5, end: 300 }, 40), 125)
assert.equal(skipTo({ kind: "intro", start: 5, end: 90 }, 40), 90)
// setMark: end needs a start before it; a new start after the old end clears the end; credits only in the second half
assert.equal(setMark(undefined, "ie", 90, 2700), null)
assert.deepEqual(setMark(undefined, "is", 30.4, 2700), { is: 30, ie: undefined })
assert.deepEqual(setMark({ is: 30 }, "ie", 110, 2700), { is: 30, ie: 110 })
assert.deepEqual(setMark({ is: 30, ie: 110 }, "is", 200, 2700), { is: 200, ie: undefined })
assert.equal(setMark(undefined, "ce", 100, 2700), null)
assert.deepEqual(setMark(undefined, "ce", 2580, 2700), { ce: 120 })
console.log("skip ok")
