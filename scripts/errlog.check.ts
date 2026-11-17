// node scripts/errlog.check.ts - error log: de-dupe, levels, times, facts, caps, age, redaction, noise, merge, console, export
import assert from "node:assert/strict"
import { addError, consoleMessage, describeError, ERR_DAYS, ERR_MAX, errorFacts, errorsText, mergeErrors, pruneErrors, TIMES_MAX, type ErrEntry } from "../src/lib/errlog-pure.ts"

const DAY = 864e5, now = 1_800_000_000_000

// a repeat of kind + level + message + context bumps the counter, keeps its times and moves to the top
let l = addError([], { kind: "network", msg: "HTTP 404", ctx: "Source A", data: { status: 404 } }, now)!
l = addError(l, { kind: "network", msg: "HTTP 500", ctx: "Source A" }, now + 1)!
l = addError(l, { kind: "network", msg: "HTTP 404", ctx: "Source A", data: { status: 404, url: "http://h/x" } }, now + 2)!
assert.equal(l.length, 2)
assert.equal(l[0].msg, "HTTP 404")
assert.equal(l[0].n, 2)
assert.equal(l[0].at, now)
assert.equal(l[0].last, now + 2)
assert.deepEqual(l[0].times, [now + 2, now])
assert.deepEqual(l[0].data, { status: "404", url: "http://h/x" }, "facts of the latest occurrence, as strings")
assert.equal(l[0].level, "error")
// a different context or level is its own row
l = addError(l, { kind: "network", msg: "HTTP 404", ctx: "Source B" }, now + 3)!
l = addError(l, { kind: "network", level: "warn", msg: "HTTP 404", ctx: "Source B" }, now + 4)!
assert.equal(l.length, 4)
// times are capped
let r: ErrEntry[] = []
for (let i = 0; i < TIMES_MAX + 5; i++) r = addError(r, { kind: "error", msg: "same" }, now + i)!
assert.equal(r[0].n, TIMES_MAX + 5)
assert.equal(r[0].times.length, TIMES_MAX)
assert.equal(r[0].times[0], now + TIMES_MAX + 4)

// noise and empty messages are dropped; empty facts are not kept
assert.equal(addError(l, { kind: "uncaught", msg: "ResizeObserver loop completed with undelivered notifications." }, now), null)
assert.equal(addError(l, { kind: "uncaught", msg: "Script error." }, now), null)
assert.equal(addError(l, { kind: "error", msg: "   " }, now), null)
assert.equal(addError([], { kind: "error", msg: "x", data: { a: undefined, b: "", c: null } }, now)![0].data, undefined)

// secrets never reach the log, facts included
const s = addError([], { kind: "playback", msg: "failed http://h.tv/live/bob/hunter2/123.ts", detail: "GET http://h.tv/get.php?username=bob&password=hunter2", route: "#/player/x", data: { url: "http://h.tv/movie/bob/hunter2/9.mkv", body: "{\"token\":\"abc123secret\"}" } }, now)!
assert.ok(!JSON.stringify(s).includes("hunter2"), "password redacted")
assert.ok(!JSON.stringify(s).includes("bob"), "username redacted")
assert.ok(!JSON.stringify(s).includes("abc123secret"), "token in a body redacted")

// caps: newest ERR_MAX kept; rows older than ERR_DAYS (by last occurrence) dropped
let big: ErrEntry[] = []
for (let i = 0; i < ERR_MAX + 20; i++) big = addError(big, { kind: "error", msg: "e" + i }, now + i)!
assert.equal(big.length, ERR_MAX)
assert.equal(big[0].msg, "e" + (ERR_MAX + 19))
assert.equal(pruneErrors(big, now + ERR_DAYS * DAY + ERR_MAX + 30).length, 0)

// merge: rows logged before the saved log was read fold into it; old rows without level/times are filled in
const saved = [{ id: "old", kind: "network", msg: "HTTP 404", ctx: "Source A", at: now - 10, last: now - 5, n: 3 }] as unknown as ErrEntry[]
const mem = addError(addError([], { kind: "network", msg: "HTTP 404", ctx: "Source A" }, now)!, { kind: "crash", msg: "boom" }, now + 1)!
const m = mergeErrors(saved, mem, now + 2)
assert.equal(m.length, 2)
assert.equal(m[0].msg, "boom")
assert.equal(m[1].id, "old")
assert.equal(m[1].n, 4)
assert.equal(m[1].at, now - 10)
assert.deepEqual(m[1].times, [now, now - 5])
assert.equal(m[1].level, "error")

// describeError / errorFacts handle anything thrown
assert.equal(describeError(new TypeError("Failed to fetch")).msg, "TypeError: Failed to fetch")
assert.equal(describeError(new Error("boom")).msg, "boom")
assert.equal(describeError("plain").msg, "plain")
assert.equal(describeError({ message: "obj" }).msg, "obj")
assert.equal(describeError(undefined).msg, "undefined")
const he = Object.assign(new Error("HTTP 403"), { name: "HttpError", status: 403, url: "http://x/y", method: "GET", body: "denied" })
assert.deepEqual(errorFacts(he), { type: "HttpError", status: 403, url: "http://x/y", method: "GET", body: "denied" })
assert.deepEqual(errorFacts(new Error("x", { cause: new Error("inner") })), { cause: "inner" })
assert.deepEqual(errorFacts("str"), {})

// console: printf placeholders, %c styles dropped, Errors by message with their stack as detail
assert.equal(consoleMessage(["Warning: %s failed in %s", "render", "Foo", "extra"]).msg, "Warning: render failed in Foo extra")
assert.equal(consoleMessage(["%cstyled", "color:red", "x"]).msg, "styled x")
const ce = consoleMessage(["load", new Error("bad")])
assert.equal(ce.msg, "load bad")
assert.ok(ce.detail?.includes("bad"))
assert.equal(consoleMessage([{ a: 1 }]).msg, "{\"a\":1}")

// export: header, count, one line per row with level, facts, repeat times, stack indented
const txt = errorsText(addError(l, { kind: "crash", msg: "x is undefined", detail: "TypeError: x\n  at Foo" }, now + 5)!, ["Leen TV 1.0"])
assert.match(txt, /^Leen TV 1\.0\n5 entries\n/)
assert.match(txt, /\[network\] HTTP 404 - Source A/)
assert.match(txt, /\[network\/warn\] HTTP 404 - Source B/)
assert.match(txt, /\(x2, first /)
assert.match(txt, /\n {4}status: 404\n/)
assert.match(txt, /\n {4}times: /)
assert.match(txt, /\n {4} {2}at Foo/)

console.log("errlog.check ok")
