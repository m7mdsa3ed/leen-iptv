// node scripts/errlog.check.ts - error log: de-dupe, caps, age, redaction, noise, export
import assert from "node:assert/strict"
import { addError, describeError, ERR_DAYS, ERR_MAX, errorsText, pruneErrors, type ErrEntry } from "../src/lib/errlog-pure.ts"

const DAY = 864e5, now = 1_800_000_000_000

// a repeat of kind + message + context bumps the counter and moves to the top
let l = addError([], { kind: "network", msg: "HTTP 404", ctx: "Source A" }, now)!
l = addError(l, { kind: "network", msg: "HTTP 500", ctx: "Source A" }, now + 1)!
l = addError(l, { kind: "network", msg: "HTTP 404", ctx: "Source A" }, now + 2)!
assert.equal(l.length, 2)
assert.equal(l[0].msg, "HTTP 404")
assert.equal(l[0].n, 2)
assert.equal(l[0].at, now)
assert.equal(l[0].last, now + 2)
// a different context is its own row
l = addError(l, { kind: "network", msg: "HTTP 404", ctx: "Source B" }, now + 3)!
assert.equal(l.length, 3)

// noise and empty messages are dropped
assert.equal(addError(l, { kind: "uncaught", msg: "ResizeObserver loop completed with undelivered notifications." }, now), null)
assert.equal(addError(l, { kind: "uncaught", msg: "Script error." }, now), null)
assert.equal(addError(l, { kind: "error", msg: "   " }, now), null)

// secrets never reach the log
const s = addError([], { kind: "playback", msg: "failed http://h.tv/live/bob/hunter2/123.ts", detail: "GET http://h.tv/get.php?username=bob&password=hunter2", route: "#/player/x" }, now)!
assert.ok(!JSON.stringify(s).includes("hunter2"), "password redacted")
assert.ok(!JSON.stringify(s).includes("bob"), "username redacted")

// caps: newest ERR_MAX kept; rows older than ERR_DAYS (by last occurrence) dropped
let big: ErrEntry[] = []
for (let i = 0; i < ERR_MAX + 20; i++) big = addError(big, { kind: "error", msg: "e" + i }, now + i)!
assert.equal(big.length, ERR_MAX)
assert.equal(big[0].msg, "e" + (ERR_MAX + 19))
assert.equal(pruneErrors(big, now + ERR_DAYS * DAY + ERR_MAX + 30).length, 0)

// describeError handles anything thrown
assert.equal(describeError(new TypeError("Failed to fetch")).msg, "TypeError: Failed to fetch")
assert.equal(describeError(new Error("boom")).msg, "boom")
assert.equal(describeError("plain").msg, "plain")
assert.equal(describeError({ message: "obj" }).msg, "obj")
assert.equal(describeError(undefined).msg, "undefined")

// export: header, count, one line per row with the repeat count, stack indented
const txt = errorsText(addError(l, { kind: "crash", msg: "x is undefined", detail: "TypeError: x\n  at Foo" }, now + 4)!, ["Leen TV 1.0"])
assert.match(txt, /^Leen TV 1\.0\n4 entries\n/)
assert.match(txt, /\[network\] HTTP 404 - Source A/)
assert.match(txt, /\(x2, first /)
assert.match(txt, /\n {4} {2}at Foo/)

console.log("errlog.check ok")
