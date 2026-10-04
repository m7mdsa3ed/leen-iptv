import { useEffect, useState } from "react"
import { ArrowLeft, Check, Plus } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { SPORTS_PROVIDERS, type SportsGame } from "@/lib/api"
import { Countdown } from "@/components/tv/sports"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"

const BACK = 30 * 864e5, FWD = 180 * 864e5 // recent results + future fixtures window

/** A followed team's games. Route `id` = `${provider}~${teamId}`; name/badge/league ride along for a first paint. */
export default function TeamPage({ id, name, badge, league }: { id?: string; name?: string; badge?: string; league?: string }) {
  const t = useT()
  const back = useRoute((s) => s.back)
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
  const status = (g: SportsGame) => (g.status === "live" ? t("pages.team.live") : g.status === "final" ? t("pages.team.final") : <Countdown at={g.startMs} />)
  const row = (g: SportsGame) => (
    <div key={g.id} className="flex items-center gap-4 rounded-2xl bg-surface-2 p-3">
      <span dir="ltr" data-ltr className="w-48 shrink-0 text-sm text-muted-foreground">{when(g)}</span>
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-base">
          <bdi className={g.home.id === teamId ? "font-semibold" : ""}>{g.home.name}</bdi> <span className="text-muted-foreground">{t("pages.team.vs")}</span> <bdi className={g.away.id === teamId ? "font-semibold" : ""}>{g.away.name}</bdi>
        </span>
        {g.venue && <span dir="auto" className="block truncate text-sm text-muted-foreground">{g.venue}</span>}
      </span>
      <span dir="ltr" data-ltr className="shrink-0 text-end text-sm">
        {result(g) && <span className="block text-base font-medium">{result(g)}</span>}
        <span className={`block ${g.status === "live" ? "text-destructive" : "text-muted-foreground"}`}>{status(g)}</span>
      </span>
    </div>
  )

  const upcoming = (games ?? []).filter((g) => g.status !== "final")
  const results = (games ?? []).filter((g) => g.status === "final").sort((a, b) => b.startMs - a.startMs)

  return (
    <div className="relative h-full overflow-y-auto bg-background px-[var(--gx)] pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="m-rise mt-6 flex items-center gap-4">
          {image
            ? <img src={image} alt="" decoding="async" className="size-20 shrink-0 object-contain md:size-28" />
            : <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl font-medium md:size-28">{title.slice(0, 1)}</div>}
          <div className="min-w-0 flex-1">
            <h1 dir="auto" className="truncate text-3xl font-medium tracking-tight text-foreground md:text-5xl">{title}</h1>
            {(league ?? follow?.league) && <p dir="auto" className="mt-1 text-base text-muted-foreground">{league ?? follow?.league}</p>}
          </div>
          <Pill variant={followed ? "tonal" : "primary"} data-autofocus onClick={() => toggleFollow({ provider, teamId, name: title, badge: image, league: league ?? follow?.league })}>
            {followed ? <Check className="size-5" /> : <Plus className="size-5" />}{followed ? t("pages.team.unfollow") : t("pages.team.follow")}
          </Pill>
        </div>

        <h2 className="mt-8 text-xl font-medium text-foreground">{t("pages.team.games")}</h2>
        {busy && <p className="mt-3 text-muted-foreground">{t("pages.team.loading")}</p>}
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
