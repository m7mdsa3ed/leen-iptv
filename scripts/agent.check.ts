// node scripts/agent.check.ts - voice agent core: spoken-query ranking, resume episode, suggestions, PIN locks, tool spec
import assert from "node:assert/strict"
import { argLine, asStep, CHAT_KEEP, descOf, phaseOf, prepareHistory, inOrder, locked, rank, resultLine, resumeIndex, shelfProgram, sliceLevels, splitFences, suggest } from "../src/lib/agent/pure.ts"
import { checkProgram, makeLibrary } from "../src/lib/agent/library.ts"
import { installPolyfills } from "../src/lib/agent/poly.ts"
import { CHAT_TOOLS, EXAMPLE_PROGRAM, instructions, TOOLS } from "../src/lib/agent/spec.ts"
import type { Item } from "../src/lib/types.ts"

const it = (id: string, name: string, kind: Item["kind"] = "movie", extra: Partial<Item> = {}): Item => ({ id, kind, name, group: "G", ...extra })

// ranking: exact > prefix > word > contains > all words; kind filter; max; Arabic folding; channel number
const cat = [
  it("a", "The Matrix Reloaded"), it("b", "Matrix"), it("c", "Animatrix"), it("d", "Matrix Resurrections"), it("e", "Dark Matrix Of Time"),
  it("f", "Breaking Bad", "series"), it("g", "MBC 1", "live", { num: 7 }), it("h", "Bad Boys"), it("i", "مسلسل اليتيم", "series"),
]
assert.deepEqual(rank(cat, "matrix").map((x) => x.id), ["b", "d", "a", "e", "c"], "exact, prefix, then word (shorter first), then contains")
assert.deepEqual(rank(cat, "Matrix!", "movie", 2).map((x) => x.id), ["b", "d"], "punctuation and case ignored, max applies")
assert.deepEqual(rank(cat, "bad", "series").map((x) => x.id), ["f"], "kind filter")
assert.deepEqual(rank(cat, "bad boys the").map((x) => x.id), [], "all words must be present")
assert.deepEqual(rank(cat, "boys bad").map((x) => x.id), ["h"], "word order does not matter")
assert.deepEqual(rank(cat, "7", "live").map((x) => x.id), ["g"], "channel number")
assert.deepEqual(rank(cat, "اليتيم").map((x) => x.id), ["i"], "Arabic names match")
assert.deepEqual(rank(cat, "   "), [])
assert.deepEqual(rank([it("z", "Cuphead", "movie", { srcName: "The Cuphead Show" })], "cuphead show").map((x) => x.id), ["z"], "the source's own name matches after a metadata rename")

// resume: last touched if unfinished, the next one if finished, first when untouched, clamped at the end
const eps = inOrder([{ id: "e3", season: 1, num: 3 }, { id: "e1", season: 1, num: 1 }, { id: "s2e1", season: 2, num: 1 }, { id: "e2", season: 1, num: 2 }])
assert.deepEqual(eps.map((e) => e.id), ["e1", "e2", "e3", "s2e1"], "season then episode")
assert.equal(resumeIndex(eps, {}), 0)
assert.equal(resumeIndex(eps, { e2: { pos: 600, dur: 2400, t: 5 } }), 1)
assert.equal(resumeIndex(eps, { e2: { pos: 2390, dur: 2400, t: 5 } }), 2, "finished -> the next episode")
assert.equal(resumeIndex(eps, { e1: { pos: 100, dur: 100, t: 1 }, e3: { pos: 2390, dur: 2400, t: 9 } }), 3, "newest touch wins, crosses the season")
assert.equal(resumeIndex(eps, { s2e1: { pos: 2390, dur: 2400, t: 9 } }), 3, "finished last episode stays on it")

// locks: only with a PIN, by category (groupKey-insensitive), any of a merged item's categories
assert.equal(locked(null, it("x", "X")), false)
assert.equal(locked({ locked: ["movie|G"] }, it("x", "X")), false, "no PIN: nothing is locked")
assert.equal(locked({ pin: "1234", locked: ["movie|G"] }, it("x", "X")), true)
assert.equal(locked({ pin: "1234", locked: ["movie|g!"] }, it("x", "X")), true, "category keys compare by groupKey")
assert.equal(locked({ pin: "1234", locked: ["series|G"] }, it("x", "X")), false, "another kind")
assert.equal(locked({ pin: "1234", locked: ["movie|Kids"] }, it("x", "X", "movie", { cats: ["G", "Kids"] })), true, "a merged copy in a locked category")

// suggest: unfinished (newest first), favorites, recents, new; deduped, kind-filtered, locked skipped, capped
const byId = new Map(["m1", "m2", "m3", "m4", "s1", "l1"].map((id) => [id, it(id, id, id.startsWith("s") ? "series" : id.startsWith("l") ? "live" : "movie")]))
const base = { favs: ["m3", "m1"], recents: ["m4", "m2"], get: (id: string) => byId.get(id), fresh: [it("n1", "N1"), it("n2", "N2")], ok: () => true }
const all = suggest({ ...base, progress: { m2: { pos: 100, dur: 1000, t: 1 }, s1: { pos: 100, dur: 1000, t: 5 }, m4: { pos: 990, dur: 1000, t: 9 }, m3: { pos: 10, dur: 1000, t: 8 } }, max: 10 })
assert.deepEqual(all.map((p) => p.item.id), ["s1", "m2", "m3", "m1", "m4", "n1", "n2"])
assert.deepEqual(all.map((p) => p.why), ["continue", "continue", "favorite", "favorite", "recent", "new", "new"], "finished and barely-started titles do not count as 'continue'")
assert.deepEqual(suggest({ ...base, progress: {}, kind: "series", max: 3 }).map((p) => p.item.id), [], "no series among favs, recents, new")
assert.equal(suggest({ ...base, progress: {} }).length, 6, "default cap")
assert.deepEqual(suggest({ ...base, progress: {}, ok: (i) => i.id !== "m3", max: 2 }).map((p) => p.item.id), ["m1", "m4"], "locked items are skipped")

// spec: every tool is a function with an object schema, names unique, required fields exist; instructions carry the screen
assert.equal(new Set(TOOLS.map((x) => x.name)).size, TOOLS.length)
for (const x of TOOLS) {
  assert.equal(x.type, "function")
  const p = x.parameters as { type: string; properties: Record<string, unknown>; required?: string[] }
  assert.equal(p.type, "object")
  for (const r of p.required ?? []) assert.ok(r in p.properties, `${x.name}.${r}`)
}
assert.match(instructions("ar", "on Movies"), /Masri/)
assert.match(instructions("en", "playing Heat"), /Right now: playing Heat/)
// the OpenUI screen: a valid program reports its shelf ids; unknown parts, missing props, no root and empty text are errors the model can read
const lib = makeLibrary({ Screen: () => null, Shelf: () => null, Note: () => null, Chips: () => null } as never)
const ok = checkProgram(lib, EXAMPLE_PROGRAM)
assert.deepEqual(ok, { ok: true, ids: ["src|movie|12", "src|series|7"] }, "the prompt's own example parses")
assert.deepEqual(checkProgram(lib, shelfProgram('Tonight "now"', ["a|movie|1", "b|live|2"], true)), { ok: true, ids: ["a|movie|1", "b|live|2"] }, "shelfProgram escapes quotes and keeps ids")
for (const bad of ["", "a = Note(\"x\")", "root = Screen([a])\na = Banner(\"x\")", "root = Screen([a])\na = Shelf(\"x\")"]) {
  const r = checkProgram(lib, bad)
  assert.equal(r.ok, false, JSON.stringify(bad))
  assert.ok(!r.ok && r.error.length > 0)
}
assert.match(lib.prompt({}), /Shelf\(title: string, ids: string\[\]/, "the library prompt lists the parts")
assert.match(instructions("en", "x", "SCREEN LANGUAGE"), /SCREEN LANGUAGE/)
assert.ok(TOOLS.some((x) => x.name === "show"))

// the level meter: silence ~0, a loud tone high, 24 kHz slices of 1200 samples
const pcm = (amp: number, n: number) => { const b = new Uint8Array(n * 2); for (let i = 0; i < n; i++) { const v = Math.round(Math.sin(i / 5) * amp * 32767); b[2 * i] = v & 255; b[2 * i + 1] = (v >> 8) & 255 } return Buffer.from(b).toString("base64") }
assert.deepEqual(sliceLevels(pcm(0, 2400)), [0, 0], "silence")
const loud = sliceLevels(pcm(0.5, 2500))
assert.equal(loud.length, 3, "2500 samples = 2 full slices + a partial one")
assert.ok(loud[0] > 0.8 && loud[0] <= 1, "a loud tone fills the bar")
assert.ok(sliceLevels(pcm(0.02, 1200))[0] < loud[0], "quieter is lower")
// chat answers: words and screens in order, a fence still arriving is not done, empty fences vanish
assert.deepEqual(splitFences("Here you go.\n```openui-lang\nroot = Screen([a])\na = Note(\"x\")\n```\nAnything else?"), [
  { type: "text", text: "Here you go." }, { type: "ui", program: 'root = Screen([a])\na = Note("x")', done: true }, { type: "text", text: "Anything else?" }])
assert.deepEqual(splitFences("Two:\n```openui-lang\nroot = Screen([a"), [{ type: "text", text: "Two:" }, { type: "ui", program: "root = Screen([a", done: false }])
assert.deepEqual(splitFences("Just words."), [{ type: "text", text: "Just words." }])
assert.deepEqual(splitFences("```openui-lang\n\n```"), [])
// Chromium 94 polyfills: installed when missing, never over a native one
{
  const g: Record<string, unknown> = {}, arr: Record<string, unknown> = {}
  installPolyfills(g, arr)
  const sc = g.structuredClone as <T>(v: T) => T
  const src = { a: [1, { b: 2 }], d: new Date(5), m: new Map([[1, { x: 1 }]]), s: new Set([1]), n: null, u: undefined }
  const cp = sc(src)
  assert.deepEqual(cp, src); assert.notEqual(cp.a, src.a); assert.notEqual(cp.a[1], src.a[1]); assert.notEqual(cp.m.get(1), src.m.get(1))
  const loop: Record<string, unknown> = { v: 1 }; loop.self = loop
  const lc = sc(loop); assert.equal(lc.self, lc, "a cycle is copied as a cycle, not recursed forever"); assert.notEqual(lc, loop)
  const fl = arr.findLast as (this: number[], f: (x: number) => boolean) => number | undefined, fi = arr.findLastIndex as (this: number[], f: (x: number) => boolean) => number
  assert.equal(fl.call([1, 2, 3, 4], (x) => x % 2 === 1), 3); assert.equal(fi.call([1, 2, 3, 4], (x) => x % 2 === 1), 2)
  assert.equal(fl.call([1], (x) => x > 5), undefined); assert.equal(fi.call([], () => true), -1)
  const native = () => "native", g2: Record<string, unknown> = { structuredClone: native }, arr2: Record<string, unknown> = { findLast: native }
  installPolyfills(g2, arr2)
  assert.equal(g2.structuredClone, native); assert.equal(arr2.findLast, native); assert.ok("findLastIndex" in arr2)
}
// tool steps: AI SDK message parts (chat: tool-<name>, voice: dynamic-tool) become one line each
assert.equal(argLine("search", { query: " matrix " }), "matrix"); assert.equal(argLine("player", { action: "seek", seconds: -30 }), "seek -30")
assert.equal(argLine("suggest", { kind: "any" }), ""); assert.equal(argLine("play", { id: "s|movie|1" }), "s|movie|1"); assert.equal(argLine("nope", { x: 1 }), "")
assert.deepEqual(resultLine({ results: [1, 2, 3] }), { kind: "count", n: 3 }); assert.deepEqual(resultLine({ picks: [] }), { kind: "count", n: 0 })
assert.deepEqual(resultLine({ playing: "Heat" }), { kind: "text", text: "Heat" }); assert.deepEqual(resultLine({ error: "Unknown id." }), { kind: "error", text: "Unknown id." })
assert.deepEqual(resultLine({ drawn: true }), { kind: "ok" }); assert.equal(resultLine({ note: "hidden from the screen" }), null); assert.equal(resultLine("x"), null)
assert.deepEqual(asStep({ type: "tool-search", toolCallId: "c1", state: "input-streaming", input: { query: "ma" } }), { id: "c1", name: "search", state: "run", arg: "ma", result: null, desc: "" })
assert.deepEqual(asStep({ type: "dynamic-tool", toolName: "play", toolCallId: "c2", state: "output-available", input: { id: "a|movie|1" }, output: { playing: "Heat" } }), { id: "c2", name: "play", state: "done", arg: "a|movie|1", result: { kind: "text", text: "Heat" }, desc: "" })
assert.equal(asStep({ type: "tool-open", toolCallId: "c3", state: "output-available", input: { id: "x" }, output: { error: "Unknown id. Search first." } })?.state, "error", "a tool that answered with an error is shown as failed")
assert.equal(asStep({ type: "tool-open", toolCallId: "c4", state: "output-error", input: {}, errorText: "boom" })?.result?.kind, "error")
assert.equal(asStep({ type: "text" }), null); assert.equal(asStep({ type: "reasoning" }), null)
// unfenced programs (what a model sometimes writes): bare, or under a plain ``` / ```openui fence, are recovered; prose around them stays prose
{
  const prog = 'root = Screen([note, cont, choices], "Continue watching")\nnote = Note("Pick one")\ncont = Shelf("Continue watching", ["a|series|1",\n"b|movie|2"])\nchoices = Chips(["A", "B"])'
  const want = (done: boolean) => [{ type: "ui", program: prog, done }]
  assert.deepEqual(splitFences(prog, true), want(true), "the screenshot case: a bare program, nothing else")
  assert.deepEqual(splitFences(prog), want(false), "still arriving: open, not done")
  assert.deepEqual(splitFences("Here:\n" + prog + "\n\nWhich one?"), [{ type: "text", text: "Here:" }, ...want(true), { type: "text", text: "Which one?" }], "a blank line ends a bare program")
  assert.deepEqual(splitFences("Here:\n" + prog + "\nWhich one?", true), [{ type: "text", text: "Here:" }, ...want(true), { type: "text", text: "Which one?" }], "so does a prose line")
  assert.deepEqual(splitFences("```\n" + prog + "\n```"), want(true), "a plain fence")
  assert.deepEqual(splitFences("```openui\n" + prog + "\n```"), want(true), "an openui fence")
  assert.deepEqual(splitFences("Use root = it and a = b."), [{ type: "text", text: "Use root = it and a = b." }], "prose that mentions root is not a program")
  assert.deepEqual(splitFences("```openui-lang\nroot = Screen([a", true), [{ type: "ui", program: "root = Screen([a", done: true }], "final closes a fence left open")
}
// the activity phase: tool in flight, reasoning or answer streaming, else working; hidden detail when the trace is off
assert.deepEqual(phaseOf(undefined, true), { kind: "working" }); assert.deepEqual(phaseOf([], true), { kind: "working" })
assert.deepEqual(phaseOf([{ type: "tool-search", state: "input-available", input: {} }], true), { kind: "tool", name: "search", desc: "" })
assert.deepEqual(phaseOf([{ type: "tool-search", state: "output-available", output: { results: [] } }], true), { kind: "working" }, "between a finished tool and the next step")
assert.deepEqual(phaseOf([{ type: "reasoning", state: "streaming" }], true), { kind: "thinking" })
assert.deepEqual(phaseOf([{ type: "reasoning", state: "done" }], true), { kind: "working" })
assert.deepEqual(phaseOf([{ type: "text", state: "streaming" }], true), { kind: "writing" })
assert.deepEqual(phaseOf([{ type: "text", state: "done" }], true), { kind: "working" })
assert.deepEqual(phaseOf([{ type: "reasoning", state: "streaming" }], false), { kind: "working" }, "trace off: no detail")
assert.deepEqual(phaseOf([{ type: "tool-play", state: "input-available" }], false), { kind: "working" })
assert.deepEqual(phaseOf([{ type: "text", state: "streaming" }], false), { kind: "writing" }, "the answer's own streaming is not trace")
// stored chat history: a half-finished message is made safe to resume, the list is capped and starts on a user message
{
  const u = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] })
  const a = (id: string, ...parts: Record<string, unknown>[]) => ({ id, role: "assistant", parts })
  const done = { type: "tool-search", toolCallId: "c1", state: "output-available", input: { query: "x" }, output: { results: [] } }
  const open = { type: "tool-play", toolCallId: "c2", state: "input-available", input: { id: "a" } }
  const h = prepareHistory([u("1", "hi"), a("2", done, { type: "text", text: "Found.", state: "streaming" }), u("3", "play it"), a("4", open)] as never[]) as { id: string; parts: Record<string, unknown>[] }[]
  assert.deepEqual(h.map((m) => m.id), ["1", "2", "3"], "an assistant message that is only an unfinished tool call is dropped")
  const merged = prepareHistory([u("1", "a"), a("2", open), u("3", "b")] as never[]) as { id: string; parts: { text?: string }[] }[]
  assert.deepEqual(merged.map((m) => [m.id, m.parts.map((p) => p.text).join("+")]), [["1", "a+b"]], "two questions left side by side (the answer between them was cut off) become one turn")
  assert.deepEqual(h[1].parts[1], { type: "text", text: "Found.", state: "done" }, "streaming text counts as done")
  assert.equal(h[1].parts[0].type, "tool-search", "a finished tool call stays")
  const partial = prepareHistory([u("1", "x"), a("2", open, { type: "text", text: "Playing", state: "done" })] as never[]) as { parts: unknown[] }[]
  assert.equal(partial[1].parts.length, 1, "an unfinished call is cut out of a message that has words")
  assert.deepEqual(prepareHistory([a("0", { type: "text", text: "orphan" }), u("1", "q")] as never[]).map((m) => m.id), ["1"], "starts on a user message")
  assert.deepEqual(prepareHistory([] as never[]), []); assert.deepEqual(prepareHistory([a("0", { type: "text", text: "only a reply" })] as never[]), [])
  const long = Array.from({ length: 100 }, (_, i) => (i % 2 ? a(String(i), { type: "text", text: "r" }) : u(String(i), "q")))
  const cut = prepareHistory(long as never[]) as { id: string; role: string }[]
  assert.ok(cut.length <= CHAT_KEEP && cut[0].role === "user" && cut[cut.length - 1].id === "99", "capped, newest kept")
  assert.deepEqual(prepareHistory([u("1", "  "), u("2", "real")] as never[]).map((m) => m.id), ["2"], "blank messages go")
}
// the model's own status line: chat tools take a required `description`, steps and the phase carry it
assert.equal(descOf({ description: "  Searching   for Heat " }), "Searching for Heat"); assert.equal(descOf({}), ""); assert.equal(descOf(null), ""); assert.equal(descOf({ description: "x".repeat(300) }).length, 120)
assert.equal(asStep({ type: "tool-search", toolCallId: "d", state: "input-available", input: { query: "heat", description: "Searching for Heat" } })?.desc, "Searching for Heat")
assert.deepEqual(phaseOf([{ type: "tool-play", state: "input-available", input: { id: "a", description: "Playing Heat" } }], true), { kind: "tool", name: "play", desc: "Playing Heat" })
assert.equal(CHAT_TOOLS.length, TOOLS.length - 1, "chat has every tool but show")
for (const x of CHAT_TOOLS) {
  const p = x.parameters as { properties: Record<string, { type?: string }>; required?: string[] }
  assert.equal(p.properties.description?.type, "string", x.name); assert.ok(p.required?.includes("description"), `${x.name}: description is required`)
}
assert.ok(!(TOOLS.find((x) => x.name === "search")!.parameters as { properties: Record<string, unknown> }).properties.description, "voice tools are unchanged")
assert.ok(!(TOOLS.find((x) => x.name === "search")!.parameters as { required?: string[] }).required?.includes("description"))
console.log("agent.check ok")
