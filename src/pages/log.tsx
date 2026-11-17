import { useEffect, useState, type ReactNode } from "react"
import { Copy, Download, Trash2 } from "lucide-react"
import { Pill } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import pkg from "../../package.json"
import { isTv, useMode } from "@/lib/device"
import { deleteError, errorsReady, useErrors } from "@/lib/errlog"
import { errorsText } from "@/lib/errlog-pure"
import { fmt, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"

// facts shown first, in this order; the rest follow as they came
const FIRST = ["title", "status", "method", "url", "played", "engine", "type", "details", "code", "mediaError", "reason", "error", "timeout", "item", "kind", "live", "position", "retries", "attempt", "step", "at", "cause", "online", "version"]

/** One error log entry (`#/log/<id>`): what happened, where, every time it happened, its facts (HTTP status, URL, response body, codes) and the stack. */
export default function LogPage({ id }: { id: string }) {
  const t = useT()
  const mode = useMode()
  const e = useErrors((s) => s.list.find((x) => x.id === id))
  const ready = useErrors((s) => s.ready)
  const back = useRoute((s) => s.back)
  const [note, setNote] = useState("")
  const [text, setText] = useState("")
  useEffect(() => { void errorsReady() }, [])

  if (!e) return <Shell page="settings" title={t("settings.logs.title")} sub><Empty>{ready ? t("pages.log.gone") : t("common.loading")}</Empty></Shell>

  const when = (n: number) => fmt.date(n, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })
  const report = () => errorsText([e], [`Leen TV ${pkg.version} (${mode})`, navigator.userAgent, new Date().toISOString()])
  const copy = async () => {
    const r = report()
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard")
      await navigator.clipboard.writeText(r)
      setNote(t("settings.logs.copied")); setText("")
    } catch { setText(r); setNote(t("diag.copyManual")) } // insecure context / TV: show it for manual copy
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([report()], { type: "text/plain;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url; a.download = `leen-error-${e.id}.txt`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const facts = Object.keys(e.data ?? {}).sort((a, b) => (FIRST.indexOf(a) + 1 || 99) - (FIRST.indexOf(b) + 1 || 99))
  const label = (k: string) => { const key = `pages.log.fact.${k}`, v = t(key); return v === key ? k : v }

  return (
    <Shell page="settings" title={t("settings.logs.title")} sub>
      <div className="h-full overflow-y-auto p-1 pb-6">
        <div className="flex flex-col gap-4 md:max-w-4xl">
          <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-5 text-foreground md:p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={e.level === "warn" ? "rounded-full bg-amber-500/15 px-3 py-1 text-amber-700 dark:text-amber-400" : "rounded-full bg-destructive/15 px-3 py-1 text-destructive"}>{t(`settings.logs.level.${e.level}`)}</span>
              <span className="rounded-full bg-surface-3 px-3 py-1">{t(`settings.logs.kind.${e.kind}`)}</span>
              {e.n > 1 && <span className="rounded-full bg-surface-3 px-3 py-1">{t("settings.logs.times", { n: fmt.number(e.n) })}</span>}
            </div>
            <h2 dir="auto" className="break-words text-2xl font-medium tracking-tight">{e.msg}</h2>
            {e.ctx && <div dir="auto" className="break-words text-muted-foreground">{e.ctx}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <Pill data-autofocus="" onClick={() => void copy()}><Copy />{t("pages.log.copy")}</Pill>
              {!isTv && <Pill onClick={download}><Download />{t("diag.download")}</Pill>}
              <Pill onClick={() => { deleteError(e.id); back() }}><Trash2 />{t("pages.log.delete")}</Pill>
              {note && <span role="status" className="text-sm text-muted-foreground">{note}</span>}
            </div>
            {text && <textarea data-nav readOnly dir="ltr" value={text} onFocus={(ev) => ev.currentTarget.select()} aria-label={t("settings.logs.title")} className="h-56 w-full rounded-2xl bg-surface-2 p-3 font-mono text-xs text-foreground" />}
          </section>

          <Block title={t("pages.log.where")}>
            <Fact k={t("pages.log.last")} v={when(e.last)} />
            {e.n > 1 && <Fact k={t("pages.log.firstSeen")} v={when(e.at)} />}
            {e.route && <Fact k={t("pages.log.page")} v={e.route} mono />}
          </Block>

          {facts.length > 0 && <Block title={t("pages.log.facts")}>{facts.map((k) => <Fact key={k} k={label(k)} v={e.data![k]} mono={k !== "error" && k !== "reason" && k !== "cause"} />)}</Block>}

          {e.n > 1 && (
            <Block title={t("pages.log.history", { n: fmt.number(e.times.length) })}>
              <div data-nav tabIndex={0} className="flex flex-col gap-1 rounded-2xl text-sm outline-none">
                {e.times.map((n, i) => <div key={i} className="tabular-nums">{when(n)}</div>)}
                {e.n > e.times.length && <div className="text-muted-foreground">{t("pages.log.older", { n: fmt.number(e.n - e.times.length) })}</div>}
              </div>
            </Block>
          )}

          {e.detail && (
            <Block title={t("pages.log.stack")}>
              <pre data-nav tabIndex={0} dir="ltr" className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-2xl bg-surface-2 p-3 font-mono text-xs text-foreground outline-none">{e.detail}</pre>
            </Block>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-5 text-foreground md:p-6">
      <h3 className="text-xl font-medium">{title}</h3>
      {children}
    </section>
  )
}

/** A label and its value; focusable so the D-pad can scroll through long facts (a response body) on a TV. */
function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div data-nav tabIndex={0} className="flex flex-col gap-0.5 rounded-xl outline-none sm:flex-row sm:gap-4">
      <div className="shrink-0 text-sm text-muted-foreground sm:w-40">{k}</div>
      <div dir={mono ? "ltr" : "auto"} className={mono ? "min-w-0 whitespace-pre-wrap break-all font-mono text-sm" : "min-w-0 break-words text-sm"}>{v}</div>
    </div>
  )
}
