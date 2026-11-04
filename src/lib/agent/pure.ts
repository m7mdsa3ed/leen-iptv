// Pure core of the voice agent's tools (no '@/' imports, no DOM): ranking spoken queries against the catalog, the episode a show resumes on,
// what to suggest, and which items a profile's PIN locks keep out. `node scripts/agent.check.ts`.
import { fold } from "../i18n/pure.ts"
import { catsOf, findLock } from "../merge-pure.ts"
import { resumable } from "../progress-pure.ts"
import type { Item } from "../types.ts"

export type Kind = Item["kind"]
export type Prog = Record<string, { pos: number; dur: number; t: number; next?: 1 }>

/** True when the profile has a PIN and the item sits in a category it locked. The agent never opens those (a PIN cannot be spoken). */
export const locked = (p: { pin?: string; locked: string[] } | null | undefined, i: Item) => !!p?.pin && catsOf(i).some((c) => findLock(p.locked, i.kind, c))

/** 0 exact, 1 starts with, 2 a whole word, 3 contains, 4 every spoken word is somewhere in it, -1 no match. */
export function score(name: string, q: string): number {
  const n = fold(name)
  if (n === q) return 0
  if (n.startsWith(q)) return 1
  if (n.includes(" " + q) || n.includes(q + " ")) return 2
  if (n.includes(q)) return 3
  const words = q.split(/\s+/).filter(Boolean)
  return words.length > 1 && words.every((w) => n.includes(w)) ? 4 : -1
}

/** Items matching a spoken query, best first (score, then shorter name), at most `max`. A channel number matches `num` exactly. */
export function rank(items: Item[], query: string, kind: Kind | "all" = "all", max = 8): Item[] {
  const q = fold(query).replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim()
  if (!q) return []
  const hits: { i: Item; s: number }[] = []
  for (const i of items) {
    if (kind !== "all" && i.kind !== kind) continue
    let s = score(i.name, q)
    if (s < 0 && i.srcName) s = score(i.srcName, q)
    if (s < 0 && i.kind === "live" && i.num != null && String(i.num) === q) s = 0
    if (s >= 0) hits.push({ i, s })
  }
  return hits.sort((a, b) => a.s - b.s || a.i.name.length - b.i.name.length).slice(0, max).map((h) => h.i)
}

type Ep = { id: string; season: number; num: number }
/** Season/episode order, the way a show plays. */
export const inOrder = <T extends Ep>(eps: T[]) => [...eps].sort((a, b) => a.season - b.season || a.num - b.num)

/** Index (in play order) of the episode a show resumes on: the one touched last if unfinished, else the one after it, else the first. Same rule as the Detail page. */
export function resumeIndex(eps: Ep[], progress: Prog): number {
  let last = -1, at = 0
  eps.forEach((e, i) => { const t = progress[e.id]?.t ?? 0; if (t > at) { at = t; last = i } })
  if (last < 0) return 0
  const p = progress[eps[last].id]
  const done = p.dur > 0 && p.pos / p.dur > 0.95
  return Math.min(eps.length - 1, last + (done ? 1 : 0))
}

export type Pick = { item: Item; why: "continue" | "favorite" | "recent" | "new" }
/** A few things worth watching: unfinished first (newest touch), then favorites, then recents, then the newest titles; never locked, never twice. */
export function suggest(o: { progress: Prog; favs: string[]; recents: string[]; get: (id: string) => Item | undefined; fresh: Item[]; kind?: Kind | "any"; ok: (i: Item) => boolean; max?: number }): Pick[] {
  const max = o.max ?? 6, out: Pick[] = [], seen = new Set<string>()
  const add = (i: Item | undefined, why: Pick["why"]) => {
    if (!i || out.length >= max || seen.has(i.id) || (o.kind && o.kind !== "any" && i.kind !== o.kind) || !o.ok(i)) return
    seen.add(i.id); out.push({ item: i, why })
  }
  Object.entries(o.progress).filter(([, v]) => resumable(v)).sort((a, b) => b[1].t - a[1].t).forEach(([id]) => add(o.get(id), "continue"))
  o.favs.forEach((id) => add(o.get(id), "favorite"))
  o.recents.forEach((id) => add(o.get(id), "recent"))
  o.fresh.forEach((i) => add(i, "new"))
  return out
}

/** A one-shelf OpenUI Lang program (what search and suggest draw by themselves). JSON string escapes are valid OpenUI Lang string escapes. */
export const shelfProgram = (title: string, ids: string[], wide = false) =>
  `root = Screen([s])\ns = Shelf(${JSON.stringify(title)}, ${JSON.stringify(ids)}${wide ? ", true" : ""})`

/** Gemini Live speaks 24 kHz PCM16; the meter reads it in 50 ms slices. */
export const SLICE = 1200
const GAIN = 1.8 // calibration knob: speech RMS (about 0.02-0.2) to a 0..1 bar
export const loud = (rms: number) => Math.min(1, Math.sqrt(rms) * GAIN)

/** The loudness (0..1) of each 50 ms slice of one base64 PCM16 chunk (little-endian, as Gemini sends it). */
export function sliceLevels(b64: string): number[] {
  const bin = atob(b64)
  const n = bin.length >> 1
  const out: number[] = []
  for (let start = 0; start < n; start += SLICE) {
    const end = Math.min(n, start + SLICE)
    let sum = 0
    for (let i = start; i < end; i++) {
      const v = ((bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16) >> 16
      sum += (v / 32768) ** 2
    }
    out.push(loud(Math.sqrt(sum / (end - start))))
  }
  return out
}

export type Seg = { type: "text"; text: string } | { type: "ui"; program: string; done: boolean }
const FENCE = /```openui-lang[ \t]*\r?\n([\s\S]*?)(```|$)/gi
const ROOT = /^[ \t]*root\s*=\s*Screen\s*\(/
/** A line that belongs to a program: `name = ...`, an indented or bracketed continuation. A prose line after a program is none of these. */
const STMT = /^(?:[ \t]*[A-Za-z_$][\w$]*[ \t]*=|[ \t]+\S|["'\[\]{}(),])/

/**
 * Models do not always fence their program: it comes bare (`root = Screen(...)` in the prose) or under a plain ``` / ```openui fence. Give those the
 * `openui-lang` fence they meant, so code is never shown as words. A bare program runs while its lines look like statements; one that reaches the end of
 * the text is left open while the answer is still arriving, and closed once it is `final`.
 */
function fenceBare(raw: string, final: boolean): string {
  const retagged = raw.replace(/```(?:openui|[ \t]*)(?=[ \t]*\r?\n[ \t]*root\s*=)/gi, "```openui-lang")
  if (/```openui-lang/i.test(retagged)) return retagged
  const lines = retagged.split("\n"), out: string[] = []
  for (let i = 0; i < lines.length;) {
    if (!ROOT.test(lines[i])) { out.push(lines[i++]); continue }
    out.push("```openui-lang", lines[i++])
    while (i < lines.length && STMT.test(lines[i])) out.push(lines[i++])
    if (i < lines.length || final) out.push("```")
  }
  return out.join("\n")
}

/** A chat answer as words and OpenUI screens in the order written. A fence still arriving (no closing ```) is `done: false`, drawn as far as it parsed;
    `final` = the answer is complete, so a fence left open is done too. */
export function splitFences(raw: string, final = false): Seg[] {
  const src = fenceBare(raw, final)
  const out: Seg[] = []
  const text = (t: string) => { if (t.trim()) out.push({ type: "text", text: t.trim() }) }
  let at = 0
  for (const m of src.matchAll(FENCE)) {
    text(src.slice(at, m.index))
    at = m.index + m[0].length
    if ((m[1] ?? "").trim()) out.push({ type: "ui", program: m[1].trim(), done: m[2] === "```" || final })
  }
  text(src.slice(at))
  return out
}

/** One tool call of a conversation, as the window shows it (from an AI SDK `tool-<name>` or `dynamic-tool` message part). */
export type Step = { id: string; name: string; state: "run" | "done" | "error"; arg: string; result: Result | null; desc: string } // desc = the model's own status line (chat tools' `description` argument), "" when it gave none
export type Result = { kind: "count"; n: number } | { kind: "text"; text: string } | { kind: "error"; text: string } | { kind: "ok" }

type PartLike = { type?: string; toolName?: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; errorText?: string }
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {})
const text = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "")

const MAX_DESC = 120
/** The model's status line for a call, from its `description` argument: one line, capped. */
export const descOf = (input: unknown): string => text(asObj(input).description).replace(/\s+/g, " ").slice(0, MAX_DESC)

/** The main argument of a call, for the line "Searching for X": ids are resolved to titles by the window. */
export function argLine(name: string, input: unknown): string {
  const a = asObj(input)
  switch (name) {
    case "search": return text(a.query)
    case "open": case "play": return text(a.id)
    case "channel": return text(a.name)
    case "go": return text(a.page)
    case "player": return [text(a.action), a.action === "seek" ? text(a.seconds) : ""].filter(Boolean).join(" ")
    case "suggest": return text(a.kind) === "any" ? "" : text(a.kind)
    default: return ""
  }
}

/** What a tool answered, in one of four shapes. The model's own words (`note`) are never shown. */
export function resultLine(output: unknown): Result | null {
  const o = asObj(output)
  if (typeof o.error === "string") return { kind: "error", text: o.error }
  if (Array.isArray(o.results)) return { kind: "count", n: o.results.length }
  if (Array.isArray(o.picks)) return { kind: "count", n: o.picks.length }
  for (const k of ["playing", "opened", "page"]) if (typeof o[k] === "string") return { kind: "text", text: o[k] as string }
  return o.drawn === true || o.paused !== undefined || o.stopped === true || o.ok === true ? { kind: "ok" } : null
}

/** A message part as a Step, or null when it is not a tool call. */
export function asStep(part: PartLike): Step | null {
  const t = part.type ?? ""
  const name = t === "dynamic-tool" ? part.toolName : t.startsWith("tool-") ? t.slice(5) : undefined
  if (!name) return null
  const st = part.state ?? ""
  const state = st === "output-available" ? "done" : st === "output-error" || st === "output-denied" ? "error" : "run"
  const result = state === "done" ? resultLine(part.output) : state === "error" ? { kind: "error" as const, text: part.errorText ?? "" } : null
  return { id: part.toolCallId ?? `${name}:${JSON.stringify(part.input ?? null)}`, name, state: result?.kind === "error" ? "error" : state, arg: argLine(name, part.input), result, desc: descOf(part.input) }
}

export type Phase = { kind: "working" | "thinking" | "writing" } | { kind: "tool"; name: string; desc: string }
/** What the assistant is doing right now, from the last part of its message: a tool call in flight, reasoning or the answer streaming, else just working
    (waiting for the model, or between a finished tool and the next step). Tool and reasoning phases are hidden when the trace is off. */
export function phaseOf(parts: PartLike[] | undefined, trace: boolean): Phase {
  const p = parts?.[parts.length - 1] as (PartLike & { text?: string }) | undefined
  if (!p) return { kind: "working" }
  if (p.type === "text") return p.state === "streaming" ? { kind: "writing" } : { kind: "working" }
  if (!trace) return { kind: "working" }
  if (p.type === "reasoning") return p.state === "streaming" ? { kind: "thinking" } : { kind: "working" }
  const step = asStep(p)
  return step?.state === "run" ? { kind: "tool", name: step.name, desc: step.desc } : { kind: "working" }
}

export const CHAT_KEEP = 40 // messages kept per profile (about 20 exchanges); older ones are dropped
type MsgLike = { id: string; role: string; parts: (PartLike & { text?: string })[] }
const FINAL = new Set(["output-available", "output-error", "output-denied"])

/**
 * A conversation as it is stored and as it is resumed. Cut off mid-answer (the window closed, the app was killed) it holds half a message: a tool call that
 * never got its answer would be rejected by the model when sent back, a streaming part would look alive forever. So: tool calls without an outcome are dropped,
 * streaming text/reasoning counts as done, empty messages go, the last CHAT_KEEP are kept, the list starts on a user message (a reply with no question
 * above it is also refused by some providers) and consecutive user messages are merged.
 */
export function prepareHistory<T extends MsgLike>(messages: T[], keep = CHAT_KEEP): T[] {
  const clean = messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => !(asStep(p) && !FINAL.has(p.state ?? ""))).map((p) => (p.state === "streaming" ? { ...p, state: "done" } : p)),
  })).filter((m) => m.parts.some((p) => (p.type === "text" || p.type === "reasoning" ? !!p.text?.trim() : p.type !== "step-start")))
  const tail = clean.slice(-keep)
  const first = tail.findIndex((m) => m.role === "user")
  // a question whose answer was cut off to nothing sits right above the next question: two user turns in a row are valid for OpenAI-compatible services and
  // Gemini, but Claude's API wants them alternating, so they are merged into one turn (the earlier text first)
  const out: T[] = []
  for (const m of first < 0 ? [] : tail.slice(first)) {
    const prev = out[out.length - 1]
    if (prev && prev.role === "user" && m.role === "user") out[out.length - 1] = { ...prev, parts: [...prev.parts, ...m.parts] }
    else out.push(m)
  }
  return out
}
