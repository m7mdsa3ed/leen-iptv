import { useEffect, useMemo } from "react"
import { Pill } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import { useHistory } from "@/lib/history"
import { fmt, useT, type TFn } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { computeStats, level } from "@/lib/stats"
import { useApp } from "@/lib/store"

// each block is focusable (data-nav) so the D-pad can scroll through the page; --s keeps the TV focus scale tiny on big blocks
const Block = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section data-nav tabIndex={0} className={`rounded-[28px] bg-surface p-5 outline-none [--s:1.01] md:p-6 ${className}`}>
    <h3 className="mb-4 text-xl font-medium">{title}</h3>
    {children}
  </section>
)

const HEAT = [0, 0.25, 0.5, 0.75, 1] // opacity of the accent colour per intensity level
const dayName = (d: number) => fmt.date(new Date(2024, 0, 7 + d), { weekday: "short" }) // 2024-01-07 is a Sunday
const keyDate = (key: string) => fmt.date(new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)), { month: "short", day: "numeric" })
const Legend = ({ t }: { t: TFn }) => (
  <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
    {t("pages.stats.less")} {HEAT.map((o, i) => <span key={i} className="size-3 rounded-[3px] bg-surface-3"><span className="block size-full rounded-[3px] bg-accent-blue" style={{ opacity: o }} /></span>)} {t("pages.stats.more")}
  </div>
)

const Bar = ({ label, value, max, right }: { label: string; value: number; max: number; right: string }) => (
  <div className="mb-3 last:mb-0">
    <div className="mb-1 flex justify-between gap-3 text-sm"><span dir="auto" className="truncate">{label}</span><span className="shrink-0 text-muted-foreground">{right}</span></div>
    <div dir="ltr" className="h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
  </div>
)

/** Viewing totals and stream health, computed from the watch-history sessions of the current profile. */
export default function StatsPage() {
  const profileId = useApp((s) => s.profileId)
  const sessions = useHistory((s) => s.sessions)
  const days = useHistory((s) => s.days)
  const t = useT()
  const go = useRoute((s) => s.go)
  useEffect(() => { if (profileId) void useHistory.getState().load(profileId) }, [profileId])
  const st = useMemo(() => computeStats(sessions, days), [sessions, days])
  const max14 = Math.max(1, ...st.last14.map((d) => d.sec))
  const maxHeat = Math.max(1, ...st.heat.flat())
  const maxDay = Math.max(1, ...st.calendar.flat().map((c) => c?.sec ?? 0))
  const kindTotal = Math.max(1, st.kinds.live + st.kinds.movie + st.kinds.series)
  const q = st.health.quality
  const qTotal = q.good + q.fair + q.poor

  return (
    <Shell page="library" title={t("pages.stats.title")}>
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <h2 className="me-auto text-3xl font-medium tracking-tight">{t("pages.stats.heading")}</h2>
          <Pill onClick={() => go("history")}>{t("pages.stats.history")}</Pill>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1 pb-6">
          {!st.hasData ? <Empty>{t("pages.stats.empty")}</Empty> : (
            <div className="grid gap-4 md:grid-cols-2">
              <Block title={t("pages.stats.watchTime")} className="md:col-span-2">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  {([[t("pages.stats.total"), fmt.duration(st.total)], [t("pages.stats.week"), fmt.duration(st.week)], [t("pages.stats.month"), fmt.duration(st.month)], [t("pages.stats.avgSession"), fmt.duration(st.avg)], [t("pages.stats.streak"), fmt.plural("pages.stats.days", st.streak)]] as const).map(([k, v]) => (
                    <div key={k}><div className="text-3xl font-medium">{v}</div><div className="text-sm text-muted-foreground">{k}</div></div>
                  ))}
                </div>
              </Block>
              <Block title={t("pages.stats.last14")} className="md:col-span-2">
                <div dir="ltr" className="flex h-36 items-end gap-2">
                  {st.last14.map((d) => (
                    <div key={d.key} className="flex h-full flex-1 flex-col justify-end" title={`${keyDate(d.key)}: ${fmt.duration(d.sec)}`}>
                      <div className="w-full rounded-t-lg bg-accent-blue" style={{ height: `${d.sec ? Math.max(3, (d.sec / max14) * 100) : 0}%` }} />
                    </div>
                  ))}
                </div>
                <div dir="ltr" className="mt-2 flex gap-2 text-xs text-muted-foreground">{st.last14.map((d) => <span key={d.key} className="flex-1 text-center">{fmt.number(Number(d.key.slice(8)))}</span>)}</div>
              </Block>
              <Block title={t("pages.stats.whatYouWatch")}>
                <Bar label={t("pages.stats.live")} value={st.kinds.live} max={kindTotal} right={fmt.duration(st.kinds.live)} />
                <Bar label={t("pages.stats.movies")} value={st.kinds.movie} max={kindTotal} right={fmt.duration(st.kinds.movie)} />
                <Bar label={t("pages.stats.shows")} value={st.kinds.series} max={kindTotal} right={fmt.duration(st.kinds.series)} />
                <h4 className="mb-2 mt-5 text-sm text-muted-foreground">{t("pages.stats.topCategories")}</h4>
                {st.topGroups.map((g) => <Bar key={g.name} label={g.name} value={g.sec} max={st.topGroups[0].sec} right={fmt.duration(g.sec)} />)}
              </Block>
              <Block title={t("pages.stats.mostWatched")}>
                {st.topTitles.map((x) => <Bar key={x.name + x.group} label={x.name} value={x.sec} max={st.topTitles[0].sec} right={x.plays > 1 ? t("pages.stats.plays", { dur: fmt.duration(x.sec), n: x.plays }) : fmt.duration(x.sec)} />)}
              </Block>
              <Block title={t("pages.stats.activity")} className="md:col-span-2">
                <div dir="ltr" className="flex gap-1">
                  <div className="flex flex-col justify-between py-0.5 pe-1 text-[10px] text-muted-foreground md:text-xs"><span>{dayName(0)}</span><span>{dayName(3)}</span><span>{dayName(6)}</span></div>
                  <div className="flex min-w-0 flex-1 gap-1">
                    {st.calendar.map((week, w) => (
                      <div key={w} className="flex min-w-0 flex-1 flex-col gap-1">
                        {week.map((c, d) => c
                          ? <div key={d} title={`${keyDate(c.key)}: ${fmt.duration(c.sec)}`} className="aspect-square w-full rounded-[3px] bg-surface-3"><div className="size-full rounded-[3px] bg-accent-blue" style={{ opacity: HEAT[level(c.sec, maxDay)] }} /></div>
                          : <div key={d} className="aspect-square w-full" />)}
                      </div>
                    ))}
                  </div>
                </div>
                <Legend t={t} />
              </Block>
              <Block title={t("pages.stats.rhythm")} className="md:col-span-2">
                <div dir="ltr" className="flex gap-1">
                  <div className="flex flex-col justify-between pe-1 text-[10px] text-muted-foreground md:text-xs">{Array.from({ length: 7 }, (_, d) => <span key={d} className="leading-none">{dayName(d)}</span>)}</div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {st.heat.map((row, d) => (
                      <div key={d} className="flex gap-1">
                        {row.map((sec, h) => <div key={h} title={`${dayName(d)} ${fmt.number(h)}:00 · ${fmt.duration(sec)}`} className="h-4 min-w-0 flex-1 rounded-[3px] bg-surface-3 md:h-5"><div className="size-full rounded-[3px] bg-accent-blue" style={{ opacity: HEAT[level(sec, maxHeat)] }} /></div>)}
                      </div>
                    ))}
                    <div className="flex justify-between text-[10px] text-muted-foreground md:text-xs">{[0, 6, 12, 18, 23].map((h) => <span key={h}>{t("pages.stats.hour", { n: h })}</span>)}</div>
                  </div>
                </div>
                <Legend t={t} />
              </Block>
              <Block title={t("pages.stats.health")}>
                <div className="grid grid-cols-2 gap-4">
                  {([[t("pages.stats.sessions"), fmt.number(st.health.sessions)], [t("pages.stats.errors"), t("pages.stats.errorsVal", { n: st.health.errors, pct: Math.round(st.health.errorRate * 100) })], [t("pages.stats.rebuffering"), t("pages.stats.perHour", { n: Math.round(st.health.stallsPerHour * 10) / 10 })], [t("pages.stats.startTime"), st.health.avgStartupMs ? t("pages.stats.seconds", { n: Math.round(st.health.avgStartupMs / 100) / 10 }) : "-"], [t("pages.stats.speed"), st.health.avgMbps ? t("pages.stats.mbps", { n: Math.round(st.health.avgMbps * 10) / 10 }) : "-"]] as const).map(([k, v]) => (
                    <div key={k}><div className="text-xl font-medium">{v}</div><div className="text-sm text-muted-foreground">{k}</div></div>
                  ))}
                </div>
                {qTotal > 0 && (
                  <>
                    <h4 className="mb-2 mt-5 text-sm text-muted-foreground">{t("pages.stats.quality")}</h4>
                    <div dir="ltr" className="flex h-3 overflow-hidden rounded-full bg-surface-3">
                      <div className="bg-emerald-400" style={{ width: `${(q.good / qTotal) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(q.fair / qTotal) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(q.poor / qTotal) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span>{t("pages.stats.good", { n: q.good })}</span><span>{t("pages.stats.fair", { n: q.fair })}</span><span>{t("pages.stats.poor", { n: q.poor })}</span></div>
                  </>
                )}
              </Block>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
