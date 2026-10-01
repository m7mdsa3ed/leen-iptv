import { useEffect, useMemo, useState } from "react"
import { Trash2 } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { Empty, Shell, useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useHistory } from "@/lib/history"
import { fmt, useT, type TFn } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { dayKey, type Session } from "@/lib/stats"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"

type Filter = "all" | "live" | "movie" | "episode"
const FILTERS: [Filter, string][] = [["all", "pages.history.all"], ["live", "pages.history.live"], ["movie", "pages.history.movies"], ["episode", "pages.history.shows"]]
const PAGE = 60

interface Row { key: string; ids: string[]; s: Session; sec: number }

const dayLabel = (key: string, t: TFn) => {
  const [y, m, d] = key.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  const today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5)
  return key === today ? t("pages.history.today") : key === yest ? t("pages.history.yesterday") : fmt.date(dt, { weekday: "long", month: "long", day: "numeric" })
}

/** Everything you watched, newest first. Repeat views of the same title on the same day are merged into one row. */
export default function HistoryPage() {
  const profileId = useApp((s) => s.profileId)
  const track = useApp((s) => s.settings.trackHistory)
  const sessions = useHistory((s) => s.sessions)
  const byId = useCatalog((s) => s.byId)
  const series = useCatalog((s) => s.byKind.series)
  const t = useT()
  const open = useOpen()
  const go = useRoute((s) => s.go)
  const [filter, setFilter] = useState<Filter>("all")
  const [confirm, setConfirm] = useState(false)
  const [shown, setShown] = useState(PAGE)

  useEffect(() => { if (profileId) void useHistory.getState().load(profileId) }, [profileId])

  const days = useMemo(() => {
    const rows = new Map<string, Row>()
    for (const s of sessions) {
      if (filter !== "all" && s.kind !== filter) continue
      const key = `${dayKey(s.start)}|${s.item}`
      const r = rows.get(key)
      if (r) { r.ids.push(s.id); r.sec += s.sec } else rows.set(key, { key, ids: [s.id], s, sec: s.sec }) // sessions are newest first: the first one is the latest view
    }
    const out = new Map<string, Row[]>()
    for (const r of rows.values()) { const k = dayKey(r.s.start); out.set(k, [...(out.get(k) ?? []), r]) }
    return [...out]
  }, [sessions, filter])

  const target = (s: Session): Item | undefined => (s.kind === "episode" ? series.find((i) => i.name === s.group) : byId.get(s.item))
  const total = days.reduce((n, [, r]) => n + r.length, 0)
  let budget = shown

  return (
    <Shell page="library" title={t("pages.history.title")}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <div className="me-auto">
            <h2 className="text-3xl font-medium tracking-tight">{t("pages.history.heading")}</h2>
            <div className="text-sm text-muted-foreground">{track ? fmt.plural("common.items", total) : t("pages.history.off")}</div>
          </div>
          {FILTERS.map(([f, label]) => <Pill key={f} variant={filter === f ? "primary" : "tonal"} onClick={() => { setFilter(f); setShown(PAGE) }}>{t(label)}</Pill>)}
          <Pill onClick={() => go("stats")}>{t("pages.history.stats")}</Pill>
          {sessions.length > 0 && (
            <Pill variant={confirm ? "primary" : "ghost"} onClick={() => (confirm ? (useHistory.getState().clear(), setConfirm(false)) : setConfirm(true))} onBlur={() => setConfirm(false)}>
              {confirm ? t("pages.history.pressAgain") : t("pages.history.clear")}
            </Pill>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-6 [--s:1.02]">
          {!total ? <Empty>{track ? t("pages.history.empty") : t("pages.history.emptyOff")}</Empty> : days.map(([k, rows]) => {
            if (budget <= 0) return null
            const part = rows.slice(0, budget)
            budget -= part.length
            return (
              <section key={k} className="mb-6">
                <h3 className="mb-2 px-1 text-xl font-medium">{dayLabel(k, t)}</h3>
                <div className="flex flex-col gap-2 p-1">
                  {part.map((r) => {
                    const tg = target(r.s)
                    const pct = r.s.dur && r.s.pos ? Math.min(100, (r.s.pos / r.s.dur) * 100) : 0
                    return (
                      <div key={r.key} className="flex items-center gap-3 rounded-2xl bg-surface p-2 pe-3">
                        <button data-nav disabled={!tg} onClick={() => tg && void open(tg, [tg])} className="flex min-w-0 flex-1 items-center gap-4 rounded-xl p-1 text-start disabled:opacity-60">
                          <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-surface-2 md:w-40">
                            {r.s.logo && <img src={r.s.logo} alt="" loading="lazy" decoding="async" className={r.s.kind === "live" ? "size-full object-contain p-3" : "size-full object-cover"} />}
                            {pct > 0 && pct < 97 && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-black/40"><div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} /></div>}
                          </div>
                          <div className="min-w-0">
                            <div dir="auto" className="truncate text-lg font-medium">{r.s.name}</div>
                            <div className="truncate text-sm text-muted-foreground">
                              {[fmt.time(r.s.start), t("pages.history.watched", { d: fmt.duration(r.sec) }), r.s.group, r.ids.length > 1 ? fmt.plural("pages.history.times", r.ids.length) : ""].filter(Boolean).join("  ·  ")}
                            </div>
                          </div>
                        </button>
                        <RoundButton label={t("pages.history.remove")} onClick={() => r.ids.forEach((id) => useHistory.getState().remove(id))}><Trash2 /></RoundButton>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          {total > shown && <div className="flex justify-center pb-4"><Pill onClick={() => setShown(shown + PAGE)}>{t("pages.history.more")}</Pill></div>}
        </div>
      </div>
    </Shell>
  )
}
