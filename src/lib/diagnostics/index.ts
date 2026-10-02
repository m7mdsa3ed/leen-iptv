import type { Source } from "@/lib/types"
import { useApp } from "@/lib/store"
import { deviceChecks, networkChecks, playbackChecks, serviceChecks } from "./basic"
import { sourceChecks, streamChecks } from "./sources"
import { probe, within, type Probe } from "./probe"
import { redact } from "./redact"
import { px } from "@/lib/net"
import { t } from "@/lib/i18n"
import { GROUPS, type Check, type Env, type Result } from "./types"

export * from "./types"
export { redact }
export { buildReport } from "./report"

/** Every check for the current configuration, in display order. `dual` results are shared within one run. */
function makeEnv(sync: Env["sync"]): Env {
  const cache = new Map<string, Promise<{ d: Probe; p?: Probe }>>()
  return {
    sync,
    dual: (url, init) => {
      let v = cache.get(url)
      if (!v) {
        const pu = px(url, useApp.getState().settings.proxy)
        const o = { init, read: 8192, text: true }
        cache.set(url, (v = Promise.all([probe(url, o), pu !== url ? probe(pu, o) : Promise.resolve(undefined)]).then(([d, p]) => ({ d, p }))))
      }
      return v
    },
  }
}

/** Connection test of a draft (not yet saved) source: only that source's own checks, without the catalog status of the saved one. */
export function testChecks(draft: Source, sync: Env["sync"]): Check[] {
  return sourceChecks(draft, makeEnv(sync)).filter((c) => !c.id.endsWith(".catalog"))
}

export function buildChecks(sync: Env["sync"]): Check[] {
  const env = makeEnv(sync)
  const src = useApp.getState().sources.filter((s) => s.enabled !== false)
  const all = [...deviceChecks(), ...playbackChecks(), ...networkChecks(), ...src.flatMap((s) => sourceChecks(s, env)), ...src.flatMap(streamChecks), ...serviceChecks(env)]
  return all.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group)) // stable: keeps per-source order inside a group
}

const cap = (r: Result): Result => ({ ...r, detail: redact(r.detail), hint: r.hint && redact(r.hint) })

/** Run checks with limited concurrency; each is independent, has a deadline (8s, 30s for stream checks) and reports as soon as it is done. */
export async function runChecks(checks: Check[], onResult: (id: string, r: Result) => void, concurrency = 4, stop?: () => boolean) {
  const q = checks.slice()
  const locks = new Map<string, Promise<unknown>>()
  const one = async (c: Check) => {
    const prev = c.lock ? locks.get(c.lock) : undefined
    const work = (async () => {
      await prev
      if (stop?.()) return
      const t0 = performance.now()
      const lim = c.slow ? 30000 : 8000
      let r: Result
      try {
        r = await within(c.run(), lim, () => ({ status: "fail" as const, detail: t("diag.timeout", { s: lim / 1000 }), hint: t("diag.timeout.hint") }))
      } catch (e) {
        r = { status: "fail", detail: e instanceof Error ? e.message : String(e) }
      }
      if (!stop?.()) onResult(c.id, cap({ ...r, ms: r.ms ?? (r.status === "skip" ? undefined : Math.round(performance.now() - t0)) }))
    })()
    if (c.lock) locks.set(c.lock, work)
    await work
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, q.length) }, async () => { for (let c = q.shift(); c; c = q.shift()) await one(c) }))
}
