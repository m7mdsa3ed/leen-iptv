import { useEffect, useState } from "react"
import { ArrowLeft, Check, Plus } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { SPORTS_PROVIDERS, type SportsGame } from "@/lib/api"
import { Countdown, liveNow } from "@/components/tv/sports"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { teamKey } from "@/lib/sports/pure"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"

const BACK = 30 * 864e5, FWD = 180 * 864e5 // recent results + future fixtures window

/** A followed team's games. Route `id` = `${provider}~${teamId}`; name/badge/league ride along for a first paint. */
export default function TeamPage({ id, name, badge, league }: { id?: string; name?: string; badge?: string; league?: string }) {
  const t = useT()
  const back = useRoute((s) => s.back)
  const go = useRoute((s) => s.go)
  const follows = useFollows()
  const toggleFollow = useApp((s) => s.toggleFollow)
  const proxy = useApp((s) => s.settings.proxy)
  const [provider, teamId] = String(id ?? "").split("~")
  const prov = SPORTS_PROVIDERS.find((p) => p.id === provider)
  const follow = follows.find((f) => f.provider === provider && f.teamId === teamId)
  const [games, setGames] = useState<SportsGame[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!prov || !teamId) return
    let live = true
    setGames(null); setErr(""); setBusy(true)
    const now = Date.now()
    prov.schedule([teamId], now - BACK, now + FWD, { id: prov.id, enabled: true, proxy })
      .then((g) => { if (live) { setGames(g); setBusy(false) } })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    return () => { live = false }
  }, [provider, teamId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = name ?? follow?.name ?? teamId
  const image = badge ?? follow?.badge
  const followed = !!follow
  const when = (g: SportsGame) => `${fmt.date(g.startMs, { weekday: "short", month: "short", day: "numeric" })} · ${fmt.time(g.startMs)}`
  const result = (g: SportsGame) => (g.homeScore != null && g.awayScore != null ? `${fmt.digits(g.homeScore)} - ${fmt.digits(g.awayScore)}` : "")
  const status = (g: SportsGame) => (liveNow(g) ? [t("pages.team.live"), g.detail].filter(Boolean).join("  ·  ") : g.status === "final" ? t("pages.team.final") : <Countdown at={g.startMs} />)
  const row = (g: SportsGame) => {
    const [sp, lg] = g.home.id.split("/")
    return (
    <button key={g.id} data-nav onClick={() => go("match", { id: `${provider}~${sp}/${lg}/${g.id}` })} className="flex w-full flex-col gap-1.5 rounded-2xl bg-surface-2 p-3 text-start md:flex-row md:items-center md:gap-4">
      <span dir="ltr" data-ltr className="text-xs text-muted-foreground md:w-44 md:shrink-0 md:text-sm">{when(g)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-base">
            <bdi className={teamKey(g.home.id) === teamKey(teamId) ? "font-semibold" : ""}>{g.home.name}</bdi> <span className="text-muted-foreground">{t("pages.team.vs")}</span> <bdi className={teamKey(g.away.id) === teamKey(teamId) ? "font-semibold" : ""}>{g.away.name}</bdi>
          </span>
          {g.venue && <span dir="auto" className="block truncate text-sm text-muted-foreground">{g.venue}</span>}
        </span>
        <span dir="ltr" data-ltr className="shrink-0 text-end text-sm">
          {result(g) && <span className="block text-base font-medium">{result(g)}</span>}
          <span className={`block ${liveNow(g) ? "text-destructive" : "text-muted-foreground"}`}>{status(g)}</span>
        </span>
      </span>
    </button>
  ) }

  const upcoming = (games ?? []).filter((g) => g.status !== "final")
  const results = (games ?? []).filter((g) => g.status === "final").sort((a, b) => b.startMs - a.startMs)

  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,var(--safe-b))] pt-[max(1.5rem,var(--safe-t))]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="m-rise mt-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-4">
            {image
              ? <img src={image} alt="" decoding="async" className="size-16 shrink-0 object-contain md:size-28" />
              : <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-medium md:size-28 md:text-3xl">{title.slice(0, 1)}</div>}
            <div className="min-w-0 flex-1">
              <h1 dir="auto" className="truncate text-2xl font-medium tracking-tight text-foreground md:text-5xl">{title}</h1>
              {(league ?? follow?.league) && <p dir="auto" className="mt-1 text-sm text-muted-foreground md:text-base">{league ?? follow?.league}</p>}
            </div>
          </div>
          <Pill className="self-start md:ms-auto md:self-auto" variant={followed ? "tonal" : "primary"} data-autofocus onClick={() => toggleFollow({ provider, teamId, name: title, badge: image, league: league ?? follow?.league })}>
            {followed ? <Check className="size-5" /> : <Plus className="size-5" />}{followed ? t("pages.team.unfollow") : t("pages.team.follow")}
          </Pill>
        </div>

        <h2 className="mt-8 text-xl font-medium text-foreground">{t("pages.team.games")}</h2>
        {busy && (
          <div role="status" aria-label={t("pages.team.loading")} className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} aria-hidden className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3 md:flex-row md:items-center md:gap-4">
                <div className="skel h-4 w-32 rounded-full !bg-surface-3 md:w-40" />
                <div className="skel h-5 flex-1 rounded-full !bg-surface-3" />
                <div className="skel h-5 w-16 rounded-full !bg-surface-3" />
              </div>
            ))}
          </div>
        )}
        {err && <p role="alert" className="mt-3 text-destructive">{t("pages.team.error")}</p>}
        {games && upcoming.length === 0 && results.length === 0 && <p className="mt-3 text-muted-foreground">{t("pages.team.none")}</p>}
        {upcoming.length > 0 && <div className="mt-3 flex flex-col gap-2" data-nav-group>{upcoming.map(row)}</div>}

        {results.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-medium text-foreground">{t("pages.sports.results")}</h2>
            <div className="mt-3 flex flex-col gap-2" data-nav-group>{results.map(row)}</div>
          </>
        )}
      </div>
    </div>
  )
}
