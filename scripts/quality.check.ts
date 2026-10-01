// node scripts/quality.check.ts
import assert from "node:assert/strict"
import { rate } from "../src/lib/quality.ts"

assert.equal(rate({ bufAhead: 12, stalls: 0, bw: 20e6, bitrate: 5e6 }), "good")
assert.equal(rate({ bufAhead: 12, stalls: 0 }), "good") // no bandwidth data: judged on buffer + stalls
assert.equal(rate({ bufAhead: 12, stalls: 1, bw: 20e6, bitrate: 5e6 }), "fair")
assert.equal(rate({ bufAhead: 3, stalls: 0 }), "fair")
assert.equal(rate({ bufAhead: 12, stalls: 0, bw: 6e6, bitrate: 5e6 }), "fair") // 1.2x headroom
assert.equal(rate({ bufAhead: 12, stalls: 3 }), "poor")
assert.equal(rate({ bufAhead: 12, stalls: 0, bw: 4e6, bitrate: 5e6 }), "poor") // slower than the stream
assert.equal(rate({ bufAhead: 0.5, stalls: 0 }), "poor")
console.log("quality ok")
