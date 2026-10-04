import { useCallback, useEffect, useRef, useState } from "react"
import { Check as CheckIcon, Copy, Download, Minus, RefreshCw, TriangleAlert, X } from "lucide-react"
import { Pill } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { isTv } from "@/lib/device"
import { buildChecks, buildReport, GROUPS, runChecks, type Check, type GroupId, type Result, type Status } from "@/lib/diagnostics"
import { fmt, useT } from "@/lib/i18n"
import { focusFirst } from "@/lib/nav"
import { useSync } from "@/lib/sync"
import { cn } from "@/lib/utils"

// colours that read on both the light and dark surface (palette classes, never opacity on a var colour)
const TONE: Record<Status, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  fail: "text-destructive",
  skip: "text-muted-foreground",
}
const ICON = { ok: CheckIcon, warn: TriangleAlert, fail: X, skip: Minus } as const
const RANK: Record<string, number> = { fail: 0, warn: 1, pending: 2, ok: 3, skip: 4 }

function Row({ c, r }: { c: Check; r?: Result }) {
  const t = useT()
  if (!r)
    return (
      <div data-nav tabIndex={0} role="status" aria-label={`${c.title}: ${t("diag.running")}`} className="flex animate-pulse items-center gap-3 rounded-2xl p-3 outline-none">
        <span className="size-8 shrink-0 rounded-full bg-surface-3" />
        <div className="min-w-0 flex-1 space-y-2"><div dir="auto" className="truncate text-base">{c.title}</div><div className="h-3 w-2/3 rounded-full bg-surface-3" /></div>
      </div>
    )
  const Icon = ICON[r.status]
  const word = t(`diag.status.${r.status}`)
  return (
    <div data-nav tabIndex={0} aria-label={`${c.title}: ${word}. ${r.detail}${r.hint ? `. ${r.hint}` : ""}`} className="flex items-start gap-3 rounded-2xl p-3 outline-none">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-surface-2", TONE[r.status])} title={word}><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div dir="auto" className="min-w-0 break-words text-base font-medium">{c.title}</div>
          {r.ms != null && <span dir="ltr" className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">{r.ms} ms</span>}
        </div>
        <div dir="auto" className={cn("whitespace-pre-line break-words text-sm", r.status === "fail" ? "text-destructive" : "text-foreground")}>{r.detail}</div>
        {r.hint && <div dir="auto" className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{r.hint}</div>}
      </div>
    </div>
  )
}

function Group({ g, list, results, sort }: { g: GroupId; list: Check[]; results: Record<string, Result>; sort: boolean }) {
  const t = useT()
  const subs = [...new Set(list.map((c) => c.sub ?? ""))]
  const rank = (c: Check) => RANK[results[c.id]?.status ?? "pending"]
  const rows = list.slice().sort((a, b) => subs.indexOf(a.sub ?? "") - subs.indexOf(b.sub ?? "") || (sort ? rank(a) - rank(b) : 0))
  let sub: string | undefined
  return (
    <section className="flex flex-col gap-1 rounded-[28px] bg-surface p-4 text-foreground md:p-5">
      <h3 className="px-3 pb-1 text-xl font-medium">{t(`diag.group.${g}`)}</h3>
      {rows.map((c) => {
        const head = (c.sub ?? "") !== sub && c.sub
        sub = c.sub ?? ""
        return (
          <div key={c.id}>
            {head && <h4 dir="auto" className="px-3 pb-1 pt-3 text-sm font-medium text-muted-foreground">{c.sub}</h4>}
            <Row c={c} r={results[c.id]} />
          </div>
        )
      })}
    </section>
  )
}

/** One screen that tests what usually breaks (device, playback, network, sources, streams, services) and says how to fix it. */
export default function DiagnosticsPage() {
  const t = useT()
  const sync = useSync()
  const syncRef = useRef(sync)
  syncRef.current = sync
  const [checks, setChecks] = useState<Check[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [running, setRunning] = useState(true)
  const [ranOnce, setRanOnce] = useState(false)
  const [total, setTotal] = useState(0)
  const [note, setNote] = useState("")
  const [text, setText] = useState("")
  const run = useRef(0)

  const start = useCallback(async () => {
    const me = ++run.current
    const cs = buildChecks(() => syncRef.current)
    setChecks(cs); setResults({}); setRunning(true); setNote(""); setText("")
    const t0 = performance.now()
    await runChecks(cs, (id, r) => setResults((p) => ({ ...p, [id]: r })), 4, () => run.current !== me)
    if (run.current !== me) return
    setTotal(performance.now() - t0); setRunning(false); setRanOnce(true)
    requestAnimationFrame(() => { if (!document.activeElement || document.activeElement === document.body) focusFirst() })
  }, [])
  useEffect(() => { void start(); return () => { run.current++ } }, [start])

  const all = Object.values(results)
  const n = (s: Status) => all.filter((r) => r.status === s).length
  const report = () => buildReport(checks, results, total)
  const copy = async () => {
    const r = report()
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard")
      await navigator.clipboard.writeText(r)
      setNote(t("diag.copied")); setText("")
    } catch { setText(r); setNote(t("diag.copyManual")) } // insecure context / TV: show it for manual copy
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([report()], { type: "text/plain;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url; a.download = `leen-diagnostics-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <Shell page="settings" title={t("diag.title")}>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-1 pb-6">
          <div className="flex flex-col gap-4 md:max-w-4xl">
            <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-5 text-foreground md:p-6">
              <h2 className="text-3xl font-medium tracking-tight">{t("diag.title")}</h2>
              <p className="text-sm text-muted-foreground">{t("diag.desc")}</p>
              <div data-nav tabIndex={0} role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl text-base outline-none">
                <span className={TONE.ok}>{t("diag.sum.ok", { n: fmt.number(n("ok")) })}</span>
                <span className={TONE.warn}>{t("diag.sum.warn", { n: fmt.number(n("warn")) })}</span>
                <span className={TONE.fail}>{t("diag.sum.fail", { n: fmt.number(n("fail")) })}</span>
                <span className="text-muted-foreground">
                  {running ? t("diag.progress", { done: fmt.number(all.length), total: fmt.number(checks.length) }) : t("diag.took", { s: fmt.decimal(total / 1000, 1) })}
                </span>
              </div>
              <div dir="ltr" className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden><div className="h-full rounded-full bg-accent-blue" style={{ width: `${checks.length ? (all.length / checks.length) * 100 : 0}%` }} /></div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill variant="primary" disabled={running} data-autofocus={ranOnce && !running ? "" : undefined} onClick={() => void start()}><RefreshCw />{t("diag.again")}</Pill>
                <Pill disabled={!all.length} onClick={() => void copy()}><Copy />{t("diag.copy")}</Pill>
                {!isTv && <Pill disabled={!all.length} onClick={download}><Download />{t("diag.download")}</Pill>}
                {note && <span role="status" className="text-sm text-muted-foreground">{note}</span>}
              </div>
              {text && <textarea data-nav readOnly dir="ltr" value={text} onFocus={(e) => e.currentTarget.select()} aria-label={t("diag.reportLabel")} className="h-56 w-full rounded-2xl bg-surface-2 p-3 font-mono text-xs text-foreground" />}
            </section>
            {GROUPS.map((g) => {
              const list = checks.filter((c) => c.group === g)
              return list.length ? <Group key={g} g={g} list={list} results={results} sort={!running} /> : null
            })}
          </div>
        </div>
      </div>
    </Shell>
  )
}
