import pkg from "../../../package.json"
import { t } from "@/lib/i18n"
import { redact } from "./redact"
import { GROUPS, type Check, type Result } from "./types"

const MARK = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" } as const

/** Plain-text report, secrets removed. Same data as the screen, one block per group. */
export function buildReport(checks: Check[], results: Record<string, Result | undefined>, totalMs: number): string {
  const L: string[] = []
  const all = checks.map((c) => results[c.id]).filter(Boolean) as Result[]
  const n = (s: Result["status"]) => all.filter((r) => r.status === s).length
  L.push(`Leen IPTV ${pkg.version} - ${t("diag.title")}`, new Date().toISOString(), `${location.protocol}//${location.host}${location.pathname}`)
  L.push(`OK ${n("ok")} / WARN ${n("warn")} / FAIL ${n("fail")} / SKIP ${n("skip")} - ${(totalMs / 1000).toFixed(1)}s`, "")
  for (const g of GROUPS) {
    const list = checks.filter((c) => c.group === g)
    if (!list.length) continue
    L.push(`== ${t(`diag.group.${g}`)} ==`)
    let sub: string | undefined
    for (const c of list) {
      if (c.sub !== sub) { sub = c.sub; if (sub) L.push(`-- ${sub}`) }
      const r = results[c.id]
      if (!r) { L.push(`[....] ${c.title}`); continue }
      L.push(`[${MARK[r.status]}] ${c.title}${r.ms != null ? ` (${r.ms} ms)` : ""}`)
      for (const l of r.detail.split("\n")) L.push(`       ${l}`)
      if (r.hint) L.push(`       > ${r.hint}`)
    }
    L.push("")
  }
  return redact(L.join("\n"))
}
