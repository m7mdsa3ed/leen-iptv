import { useState } from "react"
import { RefreshCw, Settings, X } from "lucide-react"
import { Pill } from "@/components/gtv"
import { SourceMark, hasMark } from "@/components/source/SourceMark"
import { useCatalog, type SrcState } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { fmt, t, useT } from "@/lib/i18n"
import { useBackStep } from "@/lib/nav"
import { onColor, withMeta, type SourceMeta } from "@/lib/sources"
import { useApp } from "@/lib/store"
import { openSection } from "@/settings/open"
import { cn } from "@/lib/utils"

const statusOf = (st?: SrcState) => st?.status === "ready" ? fmt.plural("settings.sources.items", st.count) : st?.status === "loading" ? st.msg || t("settings.sources.loading") : st?.status === "error" ? t("settings.sources.failed") : t("settings.sources.notLoaded")
const RANK = { ready: 0, loading: 1, idle: 2, error: 3 } as const

/** A source as a round avatar: Plex / Jellyfin = their logo, any other type = the first letter of its name on the source colour. */
function SourceAvatar({ s, className }: { s: SourceMeta; className?: string }) {
  return hasMark(s.type)
    ? <span className={cn("grid shrink-0 place-items-center rounded-full bg-surface-3", className)}><SourceMark type={s.type} color={s.color} className="size-[55%]" /></span>
    : <span style={{ background: s.color, color: onColor(s.color) }} className={cn("grid shrink-0 place-items-center rounded-full font-semibold leading-none", className)}><bdi>{s.name.trim().slice(0, 1).toUpperCase()}</bdi></span>
}

const refreshAll = () => { const { sources, settings } = useApp.getState(); void useCatalog.getState().loadAll(sources, settings.proxy, true) }

/** Top-bar source health (beside the bell): up to 3 source avatars stacked (connected first, failed dimmed), "connected/total", and a dot:
 *  green = every enabled source loaded, amber = loading or loaded with a problem, red = one failed. Pressing it lists them with Refresh. */
export function HealthButton() {
  const t = useT()
  const sources = useApp((s) => s.sources)
  const stat = useCatalog((s) => s.sources)
  const [open, setOpen] = useState(false)
  const tv = useMode() === "tv"
  useBackStep(open, () => setOpen(false))
  const on = sources.filter((s) => s.enabled !== false).map(withMeta)
  if (!on.length) return null
  const bad = on.filter((s) => stat[s.id]?.status === "error").length
  const warn = on.some((s) => stat[s.id]?.status === "loading" || (stat[s.id]?.status === "ready" && stat[s.id]!.msg))
  const up = on.filter((s) => stat[s.id]?.status === "ready").length
  const stack = [...on].sort((a, b) => RANK[stat[a.id]?.status ?? "idle"] - RANK[stat[b.id]?.status ?? "idle"]).slice(0, 3) // stable: priority order within a state
  const label = [t("gtv.health.connected", { n: fmt.number(up), total: fmt.number(on.length) }), bad ? fmt.plural("gtv.health.down", bad) : ""].filter(Boolean).join(" · ")
  return (
    <>
      <button data-nav data-pill aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
        className={cn("flex shrink-0 items-center gap-2 rounded-full font-medium tabular-nums", bad ? "bg-destructive/15 text-foreground" : "bg-surface-2 text-foreground", tv ? "min-h-11 pe-4 ps-1.5 text-base" : "min-h-8 pe-2.5 ps-1 text-xs")}>
        <span aria-hidden className="flex -space-x-2 rtl:space-x-reverse">
          {stack.map((s) => <SourceAvatar key={s.id} s={s} className={cn("ring-2 ring-surface-2", tv ? "size-8 text-sm" : "size-6 text-[0.65rem]", stat[s.id]?.status === "error" && "opacity-40 grayscale")} />)}
        </span>
        <span>{up === on.length ? fmt.number(up) : `${fmt.number(up)}/${fmt.number(on.length)}`}</span>
        <span aria-hidden className={cn("size-2 rounded-full", bad ? "bg-destructive" : warn ? "bg-amber-500" : "bg-emerald-500")} />
      </button>
      {open && <Panel close={() => setOpen(false)} />}
    </>
  )
}

function Panel({ close }: { close: () => void }) {
  const t = useT()
  const sources = useApp((s) => s.sources)
  const stat = useCatalog((s) => s.sources)
  const mobile = useMode() === "mobile"
  const on = sources.filter((s) => s.enabled !== false).map(withMeta)
  const busy = on.some((s) => stat[s.id]?.status === "loading")
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.health.title")} onClick={(e) => e.target === e.currentTarget && close()}
      className={cn("fixed inset-0 z-50 flex m-fade", mobile ? "items-end bg-black/50" : "items-start justify-end bg-black/30 pe-[var(--gx)] pt-[calc(var(--hdr)+.25rem)]")}>
      <div className={cn("flex flex-col overflow-hidden bg-surface text-foreground shadow-2xl", mobile ? "m-rise max-h-[80vh] w-full rounded-t-[28px] border-t border-[var(--fg-10)] pb-[var(--safe-b)]" : "m-pop max-h-[min(36rem,calc(100vh-var(--hdr)-2rem))] w-[26rem] rounded-[28px]")}>
        <div data-nav-group className="flex items-center gap-2 px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{t("gtv.health.title")}</h2>
          <button data-nav data-pill aria-label={t("gtv.health.refreshAll")} title={t("gtv.health.refreshAll")} disabled={busy} onClick={refreshAll} className="grid size-10 place-items-center rounded-full text-muted-foreground disabled:opacity-50"><RefreshCw className={cn("size-5", busy && "animate-spin")} /></button>
          <button data-nav data-pill aria-label={t("common.close")} onClick={close} className="grid size-10 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
        </div>
        <div data-nav-group className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {on.map((s, i) => {
            const st = stat[s.id]
            const loading = st?.status === "loading"
            const problem = st?.status === "error" || (st?.status === "ready" && st.msg) ? st.msg : ""
            return (
              <div key={s.id} className="flex items-start gap-3 rounded-2xl px-3 py-2.5">
                <span className="relative mt-0.5 shrink-0">
                  <SourceAvatar s={s} className="size-9 text-base" />
                  <span aria-hidden className={cn("absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface", st?.status === "error" ? "bg-destructive" : loading || problem ? "bg-amber-500" : st?.status === "ready" ? "bg-emerald-500" : "bg-muted-foreground")} />
                </span>
                <span className="min-w-0 flex-1">
                  <bdi className="block truncate text-base font-medium">{s.name}</bdi>
                  <span className="block text-sm text-muted-foreground">{s.label} - {statusOf(st)}</span>
                  {problem && <span role="alert" dir="auto" className="line-clamp-2 block text-sm text-destructive">{problem}</span>}
                </span>
                <button data-nav data-pill data-autofocus={i === 0 ? "" : undefined} aria-label={`${t("settings.sources.refresh")} ${s.name}`} title={t("settings.sources.refresh")} disabled={loading} onClick={() => void useCatalog.getState().retry(s.id)}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground disabled:opacity-50"><RefreshCw className={cn("size-5", loading && "animate-spin")} /></button>
              </div>
            )
          })}
        </div>
        <div className="border-t border-[var(--fg-10)] p-3">
          <Pill className="w-full" onClick={() => { close(); openSection("sources") }}><Settings />{t("gtv.health.manage")}</Pill>
        </div>
      </div>
    </div>
  )
}
