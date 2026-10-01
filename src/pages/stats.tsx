import { useEffect, useMemo } from "react"
import { Pill } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import { useHistory } from "@/lib/history"
import { useRoute } from "@/lib/nav"
import { computeStats, fmtDur, level } from "@/lib/stats"
import { useApp } from "@/lib/store"

// each block is focusable (data-nav) so the D-pad can scroll through the page; --s keeps the TV focus scale tiny on big blocks
const Block = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section data-nav tabIndex={0} className={`rounded-[28px] bg-surface p-5 outline-none [--s:1.01] md:p-6 ${className}`}>
    <h3 className="mb-4 text-xl font-medium">{title}</h3>
    {children}
  </section>
)

const HEAT = [0, 0.25, 0.5, 0.75, 1] // opacity of the accent colour per intensity level
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const Legend = () => (
  <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted-foreground">
    Less {HEAT.map((o, i) => <span key={i} className="size-3 rounded-[3px] bg-surface-3"><span className="block size-full rounded-[3px] bg-accent-blue" style={{ opacity: o }} /></span>)} More
  </div>
)

const Bar = ({ label, value, max, right }: { label: string; value: number; max: number; right: string }) => (
  <div className="mb-3 last:mb-0">
    <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{label}</span><span className="shrink-0 text-muted-foreground">{right}</span></div>
    <div className="h-2 rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} /></div>
  </div>
)

/** Viewing totals and stream health, computed from the watch-history sessions of the current profile. */
export default function StatsPage() {
  const profileId = useApp((s) => s.profileId)
  const sessions = useHistory((s) => s.sessions)
  const days = useHistory((s) => s.days)
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
    <Shell page="library" title="Stats">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <h2 className="mr-auto text-3xl font-medium tracking-tight">Viewing stats</h2>
          <Pill onClick={() => go("history")}>History</Pill>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1 pb-6">
          {!st.hasData ? <Empty>Nothing to show yet. Watch something and come back.</Empty> : (
            <div className="grid gap-4 md:grid-cols-2">
              <Block title="Watch time" className="md:col-span-2">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  {([["Total", fmtDur(st.total)], ["This week", fmtDur(st.week)], ["This month", fmtDur(st.month)], ["Avg session", fmtDur(st.avg)], ["Day streak", `${st.streak} ${st.streak === 1 ? "day" : "days"}`]] as const).map(([k, v]) => (
                    <div key={k}><div className="text-3xl font-medium">{v}</div><div className="text-sm text-muted-foreground">{k}</div></div>
                  ))}
                </div>
              </Block>
              <Block title="Last 14 days" className="md:col-span-2">
                <div className="flex h-36 items-end gap-2">
                  {st.last14.map((d) => (
                    <div key={d.key} className="flex h-full flex-1 flex-col justify-end" title={`${d.key}: ${fmtDur(d.sec)}`}>
                      <div className="w-full rounded-t-lg bg-accent-blue" style={{ height: `${d.sec ? Math.max(3, (d.sec / max14) * 100) : 0}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2 text-xs text-muted-foreground">{st.last14.map((d) => <span key={d.key} className="flex-1 text-center">{Number(d.key.slice(8))}</span>)}</div>
              </Block>
              <Block title="What you watch">
                <Bar label="Live TV" value={st.kinds.live} max={kindTotal} right={fmtDur(st.kinds.live)} />
                <Bar label="Movies" value={st.kinds.movie} max={kindTotal} right={fmtDur(st.kinds.movie)} />
                <Bar label="Shows" value={st.kinds.series} max={kindTotal} right={fmtDur(st.kinds.series)} />
                <h4 className="mb-2 mt-5 text-sm text-muted-foreground">Top categories</h4>
                {st.topGroups.map((g) => <Bar key={g.name} label={g.name} value={g.sec} max={st.topGroups[0].sec} right={fmtDur(g.sec)} />)}
              </Block>
              <Block title="Most watched">
                {st.topTitles.map((t) => <Bar key={t.name + t.group} label={t.name} value={t.sec} max={st.topTitles[0].sec} right={`${fmtDur(t.sec)}${t.plays > 1 ? ` · ${t.plays}x` : ""}`} />)}
              </Block>
              <Block title="Activity" className="md:col-span-2">
                <div className="flex gap-1">
                  <div className="flex flex-col justify-between py-0.5 pr-1 text-[10px] text-muted-foreground md:text-xs"><span>Sun</span><span>Wed</span><span>Sat</span></div>
                  <div className="flex min-w-0 flex-1 gap-1">
                    {st.calendar.map((week, w) => (
                      <div key={w} className="flex min-w-0 flex-1 flex-col gap-1">
                        {week.map((c, d) => c
                          ? <div key={d} title={`${c.key}: ${fmtDur(c.sec)}`} className="aspect-square w-full rounded-[3px] bg-surface-3"><div className="size-full rounded-[3px] bg-accent-blue" style={{ opacity: HEAT[level(c.sec, maxDay)] }} /></div>
                          : <div key={d} className="aspect-square w-full" />)}
                      </div>
                    ))}
                  </div>
                </div>
                <Legend />
              </Block>
              <Block title="Weekly rhythm" className="md:col-span-2">
                <div className="flex gap-1">
                  <div className="flex flex-col justify-between pr-1 text-[10px] text-muted-foreground md:text-xs">{DAYS.map((d) => <span key={d} className="leading-none">{d}</span>)}</div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {st.heat.map((row, d) => (
                      <div key={d} className="flex gap-1">
                        {row.map((sec, h) => <div key={h} title={`${DAYS[d]} ${h}:00 · ${fmtDur(sec)}`} className="h-4 min-w-0 flex-1 rounded-[3px] bg-surface-3 md:h-5"><div className="size-full rounded-[3px] bg-accent-blue" style={{ opacity: HEAT[level(sec, maxHeat)] }} /></div>)}
                      </div>
                    ))}
                    <div className="flex justify-between text-[10px] text-muted-foreground md:text-xs"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
                  </div>
                </div>
                <Legend />
              </Block>
              <Block title="Stream health">
                <div className="grid grid-cols-2 gap-4">
                  {([["Sessions", String(st.health.sessions)], ["Errors", `${st.health.errors} (${Math.round(st.health.errorRate * 100)}%)`], ["Rebuffering", `${st.health.stallsPerHour.toFixed(1)}/hour`], ["Avg start time", st.health.avgStartupMs ? `${(st.health.avgStartupMs / 1000).toFixed(1)} s` : "-"], ["Avg link speed", st.health.avgMbps ? `${st.health.avgMbps.toFixed(1)} Mbps` : "-"]] as const).map(([k, v]) => (
                    <div key={k}><div className="text-xl font-medium">{v}</div><div className="text-sm text-muted-foreground">{k}</div></div>
                  ))}
                </div>
                {qTotal > 0 && (
                  <>
                    <h4 className="mb-2 mt-5 text-sm text-muted-foreground">Connection quality</h4>
                    <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
                      <div className="bg-emerald-400" style={{ width: `${(q.good / qTotal) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(q.fair / qTotal) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(q.poor / qTotal) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex gap-4 text-xs text-muted-foreground"><span>Good {q.good}</span><span>Fair {q.fair}</span><span>Poor {q.poor}</span></div>
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
