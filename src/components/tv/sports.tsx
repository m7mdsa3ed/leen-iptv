import { useEffect, useState, type ReactNode } from "react"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SportsGame, SportsTeam, StandingGroup } from "@/lib/api"

/** Time until a scheduled kickoff ("in 2h"), ticking every 30s. */
export function Countdown({ at }: { at: number }) {
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 30000); return () => window.clearInterval(id) }, [])
  const m = Math.floor((at - Date.now()) / 60000)
  if (m < 1) return <>{t("pages.team.live")}</> // kickoff reached (the score poll catches up a moment later)
  if (m < 60) return <>{t("pages.sports.inMinutes", { n: fmt.number(m) })}</>
  if (m < 1440) return <>{t("pages.sports.inHours", { n: fmt.number(Math.floor(m / 60)) })}</>
  return <>{t("pages.sports.inDays", { n: fmt.number(Math.floor(m / 1440)) })}</>
}

/** A game at/after kickoff (or within a minute) reads as live, before the live-score poll catches up. */
export const liveNow = (g: SportsGame): boolean => g.status === "live" || (g.status === "scheduled" && g.startMs - Date.now() < 60000)

/** Same local calendar day. */
const isToday = (ms: number) => { const a = new Date(ms), b = new Date(); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }

/** Loading rail of GameCard-sized placeholders (same footprint, so nothing jumps when the games arrive). */
export function SkelGames({ n = 4, title = true }: { n?: number; title?: boolean }) {
  const bar = "skel h-4 rounded-full !bg-surface-3"
  return (
    <section aria-hidden className="-mx-[var(--gx)] mb-2">
      {title && <div className="skel mx-[var(--gx)] mb-1 h-7 w-48 rounded-full" />}
      <div className="rail !mx-0 overflow-hidden">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex w-64 shrink-0 flex-col gap-3 rounded-2xl bg-surface-2 p-3">
            <div className={cn(bar, "w-2/3")} />
            <div className="flex items-center gap-2"><div className="skel size-6 rounded-full !bg-surface-3" /><div className={cn(bar, "flex-1")} /></div>
            <div className="flex items-center gap-2"><div className="skel size-6 rounded-full !bg-surface-3" /><div className={cn(bar, "w-3/5")} /></div>
            <div className={cn(bar, "w-1/3")} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** A followed team's game card: the home Sports rail and the Sports tab. `mineId` bolds the followed side; a live match
 *  shows a pulsing dot and a match today shows a countdown. */
export function GameCard({ g, mineId, onOpen, className }: { g: SportsGame; mineId?: string; onOpen: () => void; className?: string }) {
  const t = useT()
  const side = (tm: SportsGame["home"]) => (
    <span key={tm.id} className="flex items-center gap-2">
      {tm.badge && <img src={tm.badge} alt="" decoding="async" loading="lazy" className="size-6 shrink-0 object-contain" />}
      <span dir="auto" className={cn("min-w-0 flex-1 truncate text-base", tm.id === mineId && "font-semibold")}>{tm.name}</span>
      {g.status !== "scheduled" && <span dir="ltr" data-ltr className="text-sm text-muted-foreground">{tm.id === g.home.id ? g.homeScore : g.awayScore}</span>}
    </span>
  )
  const live = liveNow(g)
  const when: ReactNode = live
    ? <><span aria-hidden className="size-2 rounded-full bg-destructive animate-pulse" />{[t("pages.team.live"), g.detail].filter(Boolean).join("  ·  ")}</>
    : g.status === "final" ? t("pages.team.final")
    : isToday(g.startMs) ? <Countdown at={g.startMs} />
    : t("pages.team.scheduled")
  return (
    <button data-nav data-pill onClick={onOpen} className={cn("flex w-64 shrink-0 flex-col gap-2 rounded-2xl p-3 text-start", live ? "bg-surface-3" : "bg-surface-2", className)}>
      <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span dir="auto" className="truncate">{g.league}</span>
        <span dir="ltr" data-ltr className="shrink-0">{fmt.time(g.startMs)}</span>
      </span>
      {side(g.home)}
      {side(g.away)}
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={cn("flex items-center gap-1.5", live ? "text-destructive" : isToday(g.startMs) ? "text-accent-blue" : "text-muted-foreground")}>{when}</span>
        <span dir="ltr" data-ltr className="shrink-0 text-muted-foreground">{fmt.date(g.startMs, { day: "numeric", month: "short" })}</span>
      </span>
    </button>
  )
}

/** Team crest, or its initial on a tile when the provider has none. */
export function TeamBadge({ team, className }: { team: { name: string; badge?: string }; className?: string }) {
  return team.badge
    ? <img src={team.badge} alt="" decoding="async" loading="lazy" className={cn("shrink-0 object-contain", className ?? "size-6")} />
    : <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-muted-foreground", className ?? "size-6")}>{team.name.slice(0, 1)}</span>
}

/** One game as a compact list row (works on a phone): time / live minute / FT, the two teams stacked, their scores. `mine` = a followed team key to bold. */
export function GameRow({ g, onOpen, mine, date }: { g: SportsGame; onOpen: () => void; mine?: (id: string) => boolean; date?: boolean }) {
  const t = useT()
  const live = liveNow(g)
  const scored = g.status !== "scheduled" && g.homeScore != null && g.awayScore != null
  const won = (a?: number, b?: number) => g.status === "final" && a != null && b != null && a > b
  const side = (tm: SportsGame["home"], score: number | undefined, win: boolean, red?: number) => (
    <span className="flex min-w-0 items-center gap-2.5">
      <TeamBadge team={tm} className="size-6" />
      <span dir="auto" className={cn("min-w-0 truncate", (win || mine?.(tm.id)) && "font-semibold", g.status === "final" && !win && "text-muted-foreground")}>{tm.name}</span>
      {/* red cards (from a provider that lists them, see withAlts): one card, a count beside it from two */}
      {red ? <span role="img" aria-label={`${fmt.number(red)} ${t("pages.match.ev.red")}`} className="flex shrink-0 items-center gap-0.5 text-xs text-destructive"><span aria-hidden className="inline-block h-3.5 w-2.5 rounded-[2px] bg-red-600" />{red > 1 && fmt.number(red)}</span> : null}
      <span className="flex-1" />
      {scored && <span dir="ltr" data-ltr className={cn("w-7 shrink-0 text-end tabular-nums", win ? "font-semibold" : "text-muted-foreground", live && "text-foreground")}>{fmt.number(score!)}</span>}
    </span>
  )
  return (
    <button data-nav data-pill onClick={onOpen} aria-label={`${g.home.name} ${t("pages.team.vs")} ${g.away.name}`} className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start text-base hover:bg-[var(--fg-10)]", live && "bg-destructive/[0.06]")}>
      <span className="flex w-16 shrink-0 flex-col items-center gap-0.5 text-center text-xs">
        {live ? <><span className="flex items-center gap-1 font-semibold text-destructive"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-destructive" />{t("pages.team.live")}</span>{g.detail && <span dir="ltr" className="text-destructive">{g.detail}</span>}</>
          : g.status === "final" ? <><span className="font-medium text-muted-foreground">{g.detail ?? t("pages.team.final")}</span>{date && <span className="text-muted-foreground">{fmt.date(g.startMs, { day: "numeric", month: "short" })}</span>}</>
          : <><span dir="ltr" className="font-medium">{fmt.time(g.startMs)}</span>{date && <span className="text-muted-foreground">{fmt.date(g.startMs, { weekday: "short", day: "numeric", month: "short" })}</span>}</>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        {side(g.home, g.homeScore, won(g.homeScore, g.awayScore), g.homeRed)}
        {side(g.away, g.awayScore, won(g.awayScore, g.homeScore), g.awayRed)}
        {(g.note || g.tv?.length) && <span dir="auto" className="truncate text-xs text-muted-foreground">{[g.note, g.tv?.slice(0, 3).join(", ")].filter(Boolean).join("  ·  ")}</span>}
      </span>
    </button>
  )
}

/** A league table. `mark` highlights rows (the two teams of a match); zone colours (qualification / relegation) run down the start edge. */
export function StandingsTable({ group, mark, onTeam, limit }: { group: StandingGroup; mark?: (id: string) => boolean; onTeam?: (team: SportsTeam) => void; limit?: number }) {
  const t = useT()
  const rows = limit ? group.rows.slice(0, limit) : group.rows
  const zones = [...new Map(group.rows.filter((r) => r.note && r.color).map((r) => [r.note!, r.color!])).entries()]
  return (
    <div className="overflow-hidden rounded-2xl bg-surface-2">
      {group.name && <div dir="auto" className="border-b border-[var(--fg-10)] px-4 py-2.5 text-sm font-semibold">{group.name}</div>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="w-10 py-2 ps-3 text-start font-medium">#</th>
              <th scope="col" className="py-2 text-start font-medium">{t("pages.league.team")}</th>
              {group.cols.map((c, i) => <th key={i} scope="col" className={cn("px-2 py-2 text-center font-medium tabular-nums", i === group.cols.length - 1 && "pe-3")}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team.id} className={cn("border-t border-[var(--fg-10)]", mark?.(r.team.id) && "bg-accent-blue-container/60")}>
                <td className="py-2 ps-3 tabular-nums" style={r.color ? { boxShadow: `inset 3px 0 0 ${r.color}` } : undefined}>{fmt.number(r.rank)}</td>
                <td className="max-w-0 py-1.5">
                  {onTeam
                    ? <button data-nav data-pill onClick={() => onTeam(r.team)} className="flex w-full min-w-0 items-center gap-2 rounded-lg py-0.5 pe-2 text-start"><TeamBadge team={r.team} className="size-5" /><span dir="auto" className={cn("truncate", mark?.(r.team.id) && "font-semibold")}>{r.team.short ?? r.team.name}</span></button>
                    : <span className="flex min-w-0 items-center gap-2"><TeamBadge team={r.team} className="size-5" /><span dir="auto" className="truncate">{r.team.short ?? r.team.name}</span></span>}
                </td>
                {r.values.map((v, i) => <td key={i} dir="ltr" className={cn("px-2 py-2 text-center tabular-nums", i === r.values.length - 1 ? "pe-3 font-semibold" : "text-muted-foreground")}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {zones.length > 0 && !limit && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--fg-10)] px-4 py-2.5 text-xs text-muted-foreground">
          {zones.map(([note, color]) => <span key={note} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: color }} />{note}</span>)}
        </div>
      )}
    </div>
  )
}
