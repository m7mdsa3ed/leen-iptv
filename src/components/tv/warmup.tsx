import { useEffect, useRef } from "react"
import { Check, CircleAlert } from "lucide-react"
import { LeenMark } from "@/components/gtv"
import { SourceAvatar, statusOf } from "@/components/tv/health"
import { skipWarm, useCatalog } from "@/lib/catalog"
import { useT } from "@/lib/i18n"
import { useSources } from "@/lib/sources"

/**
 * Launch warm-up: covers the app while the first load of the session runs (sources load without merging, then one merge), with a row per source
 * (what it is doing, items so far, a bar of its parts). The app below is mounted but not rendered until it ends (App.tsx). "Continue now" ends it early.
 */
export function WarmUp() {
  const t = useT()
  const warm = useCatalog((s) => s.warm)
  const stat = useCatalog((s) => s.sources)
  const sources = useSources()
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => { btn.current?.focus() }, [])
  const merging = warm === "merge"
  const parts = sources.reduce((a, s) => [a[0] + (stat[s.id]?.status === "error" ? (stat[s.id]?.total ?? 1) : (stat[s.id]?.done ?? 0)), a[1] + (stat[s.id]?.total ?? 1)], [0, 0])
  const pct = merging ? 100 : Math.round((parts[0] / Math.max(1, parts[1])) * 100)
  return (
    <div data-modal className="dark fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-[#0b0d10] p-8 text-white">
      <LeenMark className="size-20" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{merging ? t("common.warm.merge") : t("common.warm.title")}</h1>
        <p className="mt-2 max-w-md text-sm text-white/60">{t("common.warm.note")}</p>
      </div>
      <div className="w-full max-w-lg" dir="ltr" data-ltr>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full bg-accent-blue transition-[width] duration-300 ${merging ? "animate-pulse" : ""}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="flex w-full max-w-lg flex-col gap-3">
        {sources.map((s) => {
          const st = stat[s.id]
          const done = st?.status === "ready" && (st.done ?? 0) >= (st.total ?? 1)
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <SourceAvatar s={s} className="size-9 text-sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" dir="auto">{s.name}</div>
                <div className="truncate text-sm text-white/60">{statusOf(st)}</div>
              </div>
              {st?.status === "error" ? <CircleAlert className="size-5 shrink-0 text-red-400" />
                : done ? <Check className="size-5 shrink-0 text-green-400" />
                : <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
            </li>
          )
        })}
      </ul>
      {!merging && (
        <button ref={btn} data-nav data-autofocus onClick={skipWarm} className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-medium outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white">
          {t("common.warm.continue")}
        </button>
      )}
    </div>
  )
}
