import { RefreshCw, X } from "lucide-react"
import { openNote, useNotify } from "@/lib/notify"
import { applyUpdate, dismissUpdate, usePwa } from "@/lib/pwa"
import { useT } from "@/lib/i18n"

const card = "m-pop flex w-[26rem] max-w-full items-start gap-3 rounded-2xl bg-surface-3 p-4 text-foreground shadow-2xl"
const closeBtn = "grid size-8 shrink-0 place-items-center rounded-full bg-surface-2"

/** In-app notifications (e.g. a followed team's kickoff) and the app update offer: small cards, bottom-end. No focus trap and
 *  no data-nav, so they never take focus or keys (the player keeps them); a click / tap opens what it is about (the bell in the
 *  top bar lists it too). */
export function Toasts() {
  const cur = useNotify((s) => s.cur)
  const close = useNotify((s) => s.close)
  return (
    <div className="pointer-events-none fixed bottom-4 end-4 start-4 z-[60] flex flex-col items-end gap-2 [&>*]:pointer-events-auto">
      <Update />
      {cur && (
        <div role="status" aria-live="polite" className={card}>
          <div className={cur.route ? "min-w-0 flex-1 cursor-pointer" : "min-w-0 flex-1"} onClick={cur.route ? () => { close(); openNote(cur.route) } : undefined}>
            <div dir="auto" className="text-base font-medium">{cur.title}</div>
            {cur.body && <div dir="auto" className="mt-0.5 text-sm text-muted-foreground">{cur.body}</div>}
          </div>
          <button type="button" tabIndex={-1} aria-label="Close" onClick={close} className={closeBtn}><X className="size-4" /></button>
        </div>
      )}
    </div>
  )
}

/** downloading (bar once the worker knows how many files, spinner before) -> ready (Reload) -> applying (spinner). */
function Update() {
  const t = useT()
  const { phase, done, total } = usePwa()
  if (phase === "idle") return null
  const pct = total > 0 ? Math.round((Math.min(done, total) / total) * 100) : null
  const busy = phase === "applying" || (phase === "downloading" && pct === null)
  return (
    <div role="status" aria-live="polite" className={card}>
      {busy && <RefreshCw className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="text-base font-medium">{t(`common.update.${phase}`)}</div>
        {phase === "downloading" && pct !== null && (
          <div className="mt-2 flex items-center gap-2">
            <div dir="ltr" className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent-blue transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
            <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        )}
        {phase !== "applying" && <div className="mt-1 text-sm text-muted-foreground">{t(phase === "ready" ? "common.update.readyNote" : "common.update.downloadingNote")}</div>}
        {phase === "ready" && <button type="button" onClick={applyUpdate} className="mt-3 rounded-full bg-accent-blue px-4 py-1.5 text-sm font-medium text-white dark:text-black">{t("common.update.reload")}</button>}
      </div>
      {phase !== "applying" && <button type="button" tabIndex={-1} aria-label={t("common.close")} onClick={dismissUpdate} className={closeBtn}><X className="size-4" /></button>}
    </div>
  )
}
