import { useEffect, useState, type ReactNode } from "react"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SportsGame } from "@/lib/api"

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
      {tm.badge && <img src={tm.badge} alt="" decoding="async" className="size-6 shrink-0 object-contain" />}
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
