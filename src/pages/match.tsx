import { useEffect, useState, type ReactNode } from "react"
import { ArrowLeft, CalendarClock, Flag, MapPin, Users, type LucideIcon } from "lucide-react"
import { RoundButton, SkelBar } from "@/components/gtv"
import { Countdown } from "@/components/tv/sports"
import { SPORTS_PROVIDERS, type SportsMatch } from "@/lib/api"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const LIVE_MS = 30000 // refresh the score / stats this often while the match is in play
const sk = "skel !bg-surface-3"

function Tile({ icon: I, label, value, wide }: { icon: LucideIcon; label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div data-nav tabIndex={0} className={cn("flex items-center gap-3 rounded-2xl bg-surface-2 p-4 outline-none [--s:1.02]", wide && "sm:col-span-2")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-muted-foreground"><I className="size-5" /></span>
      <span className="min-w-0">
        <span className="block text-sm text-muted-foreground">{label}</span>
        <span dir="auto" className="block">{value}</span>
      </span>
    </div>
  )
}

/** Placeholder with the same footprint as the loaded page (scoreboard, stats card, info tiles). */
function Skel({ label }: { label: string }) {
  const team = <div className="flex flex-1 flex-col items-center gap-3"><div className={cn(sk, "size-16 rounded-full md:size-24")} /><SkelBar className="w-24 !bg-surface-3" /></div>
  return (
    <div role="status" aria-label={label} className="mt-6">
      <div aria-hidden className="rounded-3xl bg-surface-2 p-4 md:p-8">
        <SkelBar className="mx-auto w-32 !bg-surface-3" />
        <div className="mt-6 flex items-center gap-4">{team}<div className={cn(sk, "h-12 w-28 rounded-2xl md:h-16 md:w-40")} />{team}</div>
      </div>
      <div aria-hidden className="mt-6 flex flex-col gap-5 rounded-3xl bg-surface-2 p-4 md:p-6">
        <SkelBar className="w-36 !bg-surface-3" />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-2"><SkelBar className="mx-auto w-1/3 !bg-surface-3" /><div className={cn(sk, "h-1.5 rounded-full")} /></div>)}
      </div>
      <div aria-hidden className="mt-6 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skel h-[4.5rem] rounded-2xl" />)}</div>
    </div>
  )
}

/** One match: scoreboard (teams, score/status), the team-stat comparison, and venue/officials. Refreshes while live.
 *  Route id = `${provider}~${sport}/${league}/${eventId}`. */
export default function MatchPage({ id }: { id?: string }) {
  const t = useT()
  const back = useRoute((s) => s.back)
  const go = useRoute((s) => s.go)
  const onTop = useRoute((s) => s.stack[s.stack.length - 1]?.name === "match") // a stacked (hidden) match page stops polling
  const proxy = useApp((s) => s.settings.proxy)
  const [provider, rest] = String(id ?? "").split("~")
  const [sport, league, ...tail] = (rest ?? "").split("/")
  const eventId = tail.join("/")
  const prov = SPORTS_PROVIDERS.find((p) => p.id === provider && p.summary)
  const [m, setM] = useState<SportsMatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const load = () => prov!.summary!({ sport, league, id: eventId }, { id: prov!.id, enabled: true, proxy })

  useEffect(() => {
    if (!prov || !sport || !league || !eventId) return
    let live = true
    setM(null); setErr(""); setBusy(true)
    load()
      .then((r) => { if (live) { setM(r); setBusy(false) } })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    return () => { live = false }
  }, [provider, sport, league, eventId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  // in play: quiet refresh (a failed poll keeps the last good data)
  const inPlay = m?.status === "live"
  useEffect(() => {
    if (!inPlay || !onTop) return
    let live = true
    const id = window.setInterval(() => void load().then((r) => { if (live && r) setM(r) }, () => {}), LIVE_MS)
    return () => { live = false; window.clearInterval(id) }
  }, [inPlay, eventId, onTop]) // eslint-disable-line react-hooks/exhaustive-deps

  const side = (s: SportsMatch["home"], other: SportsMatch["home"]) => (
    <button data-nav data-pill onClick={() => go("team", { id: `${provider}~${s.team.id}`, name: s.team.name, badge: s.team.badge })} className="flex min-w-0 flex-1 flex-col items-center gap-3 rounded-2xl p-2">
      {s.team.badge
        ? <img src={s.team.badge} alt="" decoding="async" className="size-16 object-contain drop-shadow md:size-24" />
        : <span className="grid size-16 place-items-center rounded-full bg-surface-3 text-2xl font-medium md:size-24 md:text-4xl">{s.team.name.slice(0, 1)}</span>}
      <span dir="auto" className={cn("line-clamp-2 w-full text-center text-base md:text-xl", s.winner && "font-semibold", other.winner && "text-muted-foreground")}>{s.team.name}</span>
    </button>
  )

  const scored = m && m.status !== "scheduled" && m.home.score != null && m.away.score != null
  const status = m && (m.status === "live"
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1 text-sm font-medium text-white"><span aria-hidden className="size-2 animate-pulse rounded-full bg-white" />{[t("pages.team.live"), m.detail].filter(Boolean).join("  ·  ")}</span>
    : m.status === "final"
      ? <span className="rounded-full bg-surface-3 px-3 py-1 text-sm font-medium">{m.detail ?? t("pages.team.final")}</span>
      : <span className="rounded-full bg-accent-blue-container px-3 py-1 text-sm font-medium text-accent-blue"><Countdown at={m.startMs} /></span>)

  // stat rows: values at both ends, the label between, and two bars that meet in the middle (the bigger side highlighted)
  const stat = (s: SportsMatch["stats"][number]) => {
    const hn = parseFloat(s.home), an = parseFloat(s.away)
    const bar = Number.isFinite(hn) && Number.isFinite(an) && hn + an > 0
    const hp = bar ? (hn / (hn + an)) * 100 : 0, ap = bar ? 100 - hp : 0
    const lead = !bar || hn === an ? "" : hn > an ? "h" : "a"
    // data-nav on the rows: TV scrolls a page only by moving focus down it
    return (
      <div key={s.label} data-nav tabIndex={0} className="rounded-2xl p-2 outline-none [--s:1.01]">
        <div dir="ltr" data-ltr className="grid grid-cols-[4rem_1fr_4rem] items-center gap-2 text-sm md:text-base">
          <span className={lead === "h" ? "font-semibold" : "text-muted-foreground"}>{s.home || "-"}</span>
          <span className="text-center text-muted-foreground">{s.label}</span>
          <span className={cn("text-end", lead === "a" ? "font-semibold" : "text-muted-foreground")}>{s.away || "-"}</span>
        </div>
        {bar && (
          <div dir="ltr" data-ltr className="mt-1.5 flex gap-1.5">
            <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-surface-3"><span className={cn("h-full rounded-full", lead === "h" ? "bg-accent-blue" : "bg-foreground/40")} style={{ width: `${hp}%` }} /></div>
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><span className={cn("h-full rounded-full", lead === "a" ? "bg-accent-blue" : "bg-foreground/40")} style={{ width: `${ap}%` }} /></div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,var(--safe-b))] pt-[max(1.5rem,var(--safe-t))]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        {busy && <Skel label={t("pages.match.loading")} />}
        {err && <p role="alert" className="mt-6 text-destructive">{t("pages.match.error")}</p>}
        {m && !busy && (
          <>
            <header className="m-rise mt-6 overflow-hidden rounded-3xl bg-gradient-to-b from-accent-blue-container to-surface-2 p-4 md:p-8">
              {m.league && <p dir="auto" className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground md:text-sm">{m.league}</p>}
              <div className="mt-4 flex items-start gap-2" data-nav-group>
                {side(m.home, m.away)}
                <div className="flex shrink-0 flex-col items-center gap-3 pt-3 md:pt-6">
                  {scored ? (
                    <div dir="ltr" data-ltr className="flex items-center gap-3 text-5xl font-semibold tabular-nums md:text-7xl">
                      <span className={cn(m.away.winner && "text-muted-foreground")}>{fmt.digits(m.home.score!)}</span>
                      <span className="text-3xl text-muted-foreground md:text-5xl">-</span>
                      <span className={cn(m.home.winner && "text-muted-foreground")}>{fmt.digits(m.away.score!)}</span>
                    </div>
                  ) : (
                    <div dir="ltr" data-ltr className="text-4xl font-semibold tabular-nums md:text-6xl">{fmt.time(m.startMs)}</div>
                  )}
                  {status}
                  <div className="text-xs text-muted-foreground md:text-sm">{fmt.date(m.startMs, { weekday: "short", day: "numeric", month: "short" })}</div>
                </div>
                {side(m.away, m.home)}
              </div>
            </header>

            {m.stats.length > 0 ? (
              <section className="m-rise mt-6 rounded-3xl bg-surface-2 p-4 md:p-6">
                <div dir="ltr" data-ltr className="flex items-center gap-3">
                  {m.home.team.badge && <img src={m.home.team.badge} alt="" className="size-7 object-contain" />}
                  <h2 dir="auto" className="flex-1 text-center text-lg font-medium md:text-xl">{t("pages.match.stats")}</h2>
                  {m.away.team.badge && <img src={m.away.team.badge} alt="" className="size-7 object-contain" />}
                </div>
                <div className="mt-5 flex flex-col gap-4">{m.stats.map(stat)}</div>
              </section>
            ) : <p className="mt-6 text-muted-foreground">{t("pages.match.none")}</p>}

            <h2 className="mt-8 text-xl font-medium">{t("pages.match.info")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Tile icon={CalendarClock} label={t("pages.match.kickoff")} value={`${fmt.date(m.startMs, { weekday: "short", day: "numeric", month: "short" })} · ${fmt.time(m.startMs)}`} />
              {m.venue && <Tile icon={MapPin} label={t("pages.match.venue")} value={m.venue} />}
              {m.attendance && <Tile icon={Users} label={t("pages.match.attendance")} value={Number.isFinite(Number(m.attendance)) ? fmt.number(Number(m.attendance)) : m.attendance} />}
              {m.officials.length > 0 && <Tile icon={Flag} label={t("pages.match.officials")} value={m.officials.join(", ")} wide />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
