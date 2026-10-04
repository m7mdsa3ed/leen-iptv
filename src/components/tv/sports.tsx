import { useEffect, useState, type ReactNode } from "react"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SportsGame } from "@/lib/api"

/** Time until a scheduled kickoff ("in 2h"), ticking every 30s. */
export function Countdown({ at }: { at: number }) {
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 30000); return () => window.clearInterval(id) }, [])
  const m = Math.max(0, Math.floor((at - Date.now()) / 60000))
  if (m < 60) return <>{t("pages.sports.inMinutes", { n: fmt.number(m) })}</>
  if (m < 1440) return <>{t("pages.sports.inHours", { n: fmt.number(Math.floor(m / 60)) })}</>
  return <>{t("pages.sports.inDays", { n: fmt.number(Math.floor(m / 1440)) })}</>
}

/** A followed team's game card: the home Sports rail and the Sports tab. `mineId` bolds the followed side; a live match
 *  shows a pulsing dot and a scheduled one a countdown. */
export function GameCard({ g, mineId, onOpen, className }: { g: SportsGame; mineId?: string; onOpen: () => void; className?: string }) {
  const t = useT()
  const side = (tm: SportsGame["home"]) => (
    <span key={tm.id} className="flex items-center gap-2">
      {tm.badge && <img src={tm.badge} alt="" decoding="async" className="size-6 shrink-0 object-contain" />}
      <span dir="auto" className={cn("min-w-0 flex-1 truncate text-base", tm.id === mineId && "font-semibold")}>{tm.name}</span>
      {g.status !== "scheduled" && <span dir="ltr" data-ltr className="text-sm text-muted-foreground">{tm.id === g.home.id ? g.homeScore : g.awayScore}</span>}
    </span>
  )
  const when: ReactNode = g.status === "live"
    ? <><span aria-hidden className="size-2 rounded-full bg-destructive animate-pulse" />{t("pages.team.live")}</>
    : g.status === "final" ? t("pages.team.final") : <Countdown at={g.startMs} />
  return (
    <button data-nav data-pill onClick={onOpen} className={cn("flex w-64 shrink-0 flex-col gap-2 rounded-2xl p-3 text-start", g.status === "live" ? "bg-surface-3" : "bg-surface-2", className)}>
      <span className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span dir="auto" className="truncate">{g.league}</span>
        <span dir="ltr" data-ltr className="shrink-0">{fmt.time(g.startMs)}</span>
      </span>
      {side(g.home)}
      {side(g.away)}
      <span className="flex items-center justify-between gap-2 text-sm">
        <span className={cn("flex items-center gap-1.5", g.status === "live" ? "text-destructive" : "text-muted-foreground")}>{when}</span>
        <span dir="ltr" data-ltr className="shrink-0 text-muted-foreground">{fmt.date(g.startMs, { day: "numeric", month: "short" })}</span>
      </span>
    </button>
  )
}
