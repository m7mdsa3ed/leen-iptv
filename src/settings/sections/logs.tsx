import { useState } from "react"
import { ConfirmButton, Pill, Row, SectionCard, Segmented } from "../controls"
import pkg from "../../../package.json"
import { isTv, useMode } from "@/lib/device"
import { clearErrors, useErrors } from "@/lib/errlog"
import { ERR_KINDS, errorsText, type ErrEntry, type ErrKind } from "@/lib/errlog-pure"
import { fmt, useT } from "@/lib/i18n"

const PAGE = 30
type Filter = "all" | ErrKind

/** Settings > Logs: every error the app caught on this device (lib/errlog.ts), newest first; a row opens its details. Copy / download share it redacted. */
export default function LogsSection() {
  const t = useT()
  const mode = useMode()
  const list = useErrors((s) => s.list)
  const [filter, setFilter] = useState<Filter>("all")
  const [open, setOpen] = useState("")
  const [shown, setShown] = useState(PAGE)
  const [note, setNote] = useState("")
  const [text, setText] = useState("")
  const rows = filter === "all" ? list : list.filter((e) => e.kind === filter)
  const kinds = ERR_KINDS.filter((k) => list.some((e) => e.kind === k))

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

  return (
    <div className="flex flex-col gap-4">
      <SectionCard description={t("settings.logs.desc")}>
        <Row label={fmt.plural("settings.logs.count", list.length)} description={note || undefined}>
          <Pill disabled={!rows.length} onClick={() => void copy()}>{t("settings.logs.copy")}</Pill>
          {!isTv && <Pill disabled={!rows.length} onClick={download}>{t("diag.download")}</Pill>}
          <ConfirmButton disabled={!list.length} onConfirm={() => { clearErrors(); setText(""); setNote(""); setOpen("") }}>{t("settings.logs.clear")}</ConfirmButton>
        </Row>
        {text && <textarea data-nav readOnly dir="ltr" value={text} onFocus={(e) => e.currentTarget.select()} aria-label={t("settings.logs.title")} className="h-56 w-full rounded-2xl bg-surface-2 p-3 font-mono text-xs text-foreground" />}
      </SectionCard>

      <SectionCard>
        {kinds.length > 1 && (
          <Segmented<Filter> label={t("settings.logs.filter")} value={filter} onChange={(v) => { setFilter(v); setShown(PAGE) }} options={[
            { value: "all", label: t("settings.logs.kind.all", { n: fmt.number(list.length) }) },
            ...kinds.map((k) => ({ value: k, label: t(`settings.logs.kind.${k}`) + ` (${fmt.number(list.filter((e) => e.kind === k).length)})` })),
          ]} />
        )}
        <div className="flex flex-col gap-2" data-nav-group>
          {!rows.length && <div className="py-4 text-center text-muted-foreground">{t("settings.logs.empty")}</div>}
          {rows.slice(0, shown).map((e) => <LogRow key={e.id} e={e} open={open === e.id} toggle={() => setOpen(open === e.id ? "" : e.id)} />)}
          {rows.length > shown && <Pill className="self-center" onClick={() => setShown(shown + PAGE)}>{t("settings.logs.more", { n: fmt.number(rows.length - shown) })}</Pill>}
        </div>
      </SectionCard>
    </div>
  )
}

function LogRow({ e, open, toggle }: { e: ErrEntry; open: boolean; toggle: () => void }) {
  const t = useT()
  const when = (n: number) => `${fmt.date(n)} ${fmt.time(n)}`
  const sub = [t(`settings.logs.kind.${e.kind}`), when(e.last), e.n > 1 ? t("settings.logs.times", { n: fmt.number(e.n) }) : "", e.ctx].filter(Boolean)
  return (
    <button data-nav aria-expanded={open} onClick={toggle} className="flex flex-col gap-1 rounded-2xl bg-surface-2 p-3 text-start">
      <div dir="auto" className={open ? "break-words text-base" : "truncate text-base"}>{e.msg}</div>
      <div dir="auto" className="truncate text-sm text-muted-foreground">{sub.join("  ·  ")}</div>
      {open && (
        <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
          {e.n > 1 && <div>{t("settings.logs.first", { when: when(e.at) })}</div>}
          {e.route && <div dir="ltr" className="break-all">{e.route}</div>}
          {e.detail && <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-3 p-2 font-mono text-xs text-foreground">{e.detail}</pre>}
        </div>
      )}
    </button>
  )
}
