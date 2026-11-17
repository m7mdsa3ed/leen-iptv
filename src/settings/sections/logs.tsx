import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { ConfirmButton, Field, Pill, Row, SectionCard, Segmented } from "../controls"
import pkg from "../../../package.json"
import { isTv, useMode } from "@/lib/device"
import { clearErrors, useErrors } from "@/lib/errlog"
import { ERR_KINDS, errorsText, type ErrEntry, type ErrKind } from "@/lib/errlog-pure"
import { fmt, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"

const PAGE = 40
type Kind = "all" | ErrKind
type Level = "all" | "error" | "warn"

/** Settings > Logs: every error and failure the app ran into on this device (lib/errlog.ts), newest first; a row opens its own page (`#/log/<id>`). Copy / download share what is listed, redacted. */
export default function LogsSection() {
  const t = useT()
  const mode = useMode()
  const go = useRoute((s) => s.go)
  const list = useErrors((s) => s.list)
  const [kind, setKind] = useState<Kind>("all")
  const [level, setLevel] = useState<Level>("all")
  const [q, setQ] = useState("")
  const [shown, setShown] = useState(PAGE)
  const [note, setNote] = useState("")
  const [text, setText] = useState("")
  const needle = q.trim().toLowerCase()
  const rows = list.filter((e) => (kind === "all" || e.kind === kind) && (level === "all" || e.level === level) && (!needle || `${e.msg} ${e.ctx ?? ""} ${Object.values(e.data ?? {}).join(" ")}`.toLowerCase().includes(needle)))
  const kinds = ERR_KINDS.filter((k) => list.some((e) => e.kind === k))
  const nWarn = list.filter((e) => e.level === "warn").length

  const report = () => errorsText(rows, [`Leen TV ${pkg.version} (${mode})`, navigator.userAgent, new Date().toISOString()])
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
    a.href = url; a.download = `leen-errors-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  const reset = () => setShown(PAGE)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard description={t("settings.logs.desc")}>
        <Row label={fmt.plural("settings.logs.count", list.length)} description={note || (nWarn ? t("settings.logs.split", { e: fmt.number(list.length - nWarn), w: fmt.number(nWarn) }) : undefined)}>
          <Pill disabled={!rows.length} onClick={() => void copy()}>{t("settings.logs.copy")}</Pill>
          {!isTv && <Pill disabled={!rows.length} onClick={download}>{t("diag.download")}</Pill>}
          <ConfirmButton disabled={!list.length} onConfirm={() => { clearErrors(); setText(""); setNote("") }}>{t("settings.logs.clear")}</ConfirmButton>
        </Row>
        {text && <textarea data-nav readOnly dir="ltr" value={text} onFocus={(e) => e.currentTarget.select()} aria-label={t("settings.logs.title")} className="h-56 w-full rounded-2xl bg-surface-2 p-3 font-mono text-xs text-foreground" />}
      </SectionCard>

      <SectionCard>
        {nWarn > 0 && nWarn < list.length && (
          <Segmented<Level> label={t("settings.logs.level")} value={level} onChange={(v) => { setLevel(v); reset() }} options={[
            { value: "all", label: t("settings.logs.level.all") },
            { value: "error", label: t("settings.logs.level.error") },
            { value: "warn", label: t("settings.logs.level.warn") },
          ]} />
        )}
        {kinds.length > 1 && (
          <Segmented<Kind> label={t("settings.logs.filter")} value={kind} onChange={(v) => { setKind(v); reset() }} options={[
            { value: "all", label: t("settings.logs.kind.all", { n: fmt.number(list.length) }) },
            ...kinds.map((k) => ({ value: k, label: `${t(`settings.logs.kind.${k}`)} (${fmt.number(list.filter((e) => e.kind === k).length)})` })),
          ]} />
        )}
        {list.length > 0 && <Field label={t("common.search")} value={q} onChange={(v) => { setQ(v); reset() }} dir="auto" />}
        <div className="flex flex-col gap-2" data-nav-group>
          {!rows.length && <div className="py-4 text-center text-muted-foreground">{list.length ? t("settings.logs.noMatch") : t("settings.logs.empty")}</div>}
          {rows.slice(0, shown).map((e) => <LogRow key={e.id} e={e} open={() => go("log", { id: e.id })} />)}
          {rows.length > shown && <Pill className="self-center" onClick={() => setShown(shown + PAGE)}>{t("settings.logs.more", { n: fmt.number(rows.length - shown) })}</Pill>}
        </div>
      </SectionCard>
    </div>
  )
}

function LogRow({ e, open }: { e: ErrEntry; open: () => void }) {
  const t = useT()
  const sub = [t(`settings.logs.kind.${e.kind}`), `${fmt.date(e.last)} ${fmt.time(e.last)}`, e.n > 1 ? t("settings.logs.times", { n: fmt.number(e.n) }) : "", e.ctx].filter(Boolean)
  return (
    <button data-nav onClick={open} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-start">
      <span aria-label={t(`settings.logs.level.${e.level}`)} className={e.level === "warn" ? "size-2.5 shrink-0 rounded-full bg-amber-500" : "size-2.5 shrink-0 rounded-full bg-destructive"} />
      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate text-base">{e.msg}</div>
        <div dir="auto" className="truncate text-sm text-muted-foreground">{sub.join("  ·  ")}</div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl-flip" />
    </button>
  )
}
