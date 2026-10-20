import { Shell } from "@/components/tv/ui"
import { useEffect, useState } from "react"
import { ArrowLeft, Check, Plus, Trophy } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { SPORTS_PROVIDERS, type SportsGame } from "@/lib/api"
import { GameRow } from "@/components/tv/sports"
import { useApp, useFollows } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { refFor, teamKey } from "@/lib/sports/pure"
import { matchIdOf } from "@/lib/sports/games"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"

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
  const prov = SPORTS_PROVIDERS.find((p) => p.id === provider && p.schedule)
  const follow = follows.find((f) => f.provider === provider && f.teamId === teamId)
  const [games, setGames] = useState<SportsGame[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (!prov || !teamId) return
    let live = true
    setGames(null); setErr(""); setBusy(true)
    const now = Date.now()
    prov.schedule!([teamId], now - BACK, now + FWD, { id: prov.id, enabled: true, proxy })
      .then((g) => { if (live) { setGames(g); setBusy(false) } })
      .catch((e) => { if (live) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) } })
    return () => { live = false }
  }, [provider, teamId, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = name ?? follow?.name ?? teamId
  const image = badge ?? follow?.badge
  const followed = !!follow
  const row = (g: SportsGame) => <GameRow key={g.id} g={g} date mine={(id) => teamKey(id) === teamKey(teamId)} onOpen={() => go("match", { id: matchIdOf(provider, g) })} />
  const [sp, lg] = String(teamId ?? "").split("/")
  const leagueName = league ?? follow?.league ?? (sp && lg ? refFor(sp, lg).name : "")

  const upcoming = (games ?? []).filter((g) => g.status !== "final")
  const results = (games ?? []).filter((g) => g.status === "final").sort((a, b) => b.startMs - a.startMs)

  return (
    <Shell page="sports" title={title} sub>
    <div className="under-top under-bottom relative -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
      <div className="relative mx-auto w-full max-w-4xl">
        {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
        <div className="m-rise mt-6 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 items-center gap-4">
            {image
              ? <img src={image} alt="" decoding="async" className="size-16 shrink-0 object-contain md:size-28" />
              : <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl font-medium md:size-28 md:text-3xl">{title.slice(0, 1)}</div>}
            <div className="min-w-0 flex-1">
              <h1 dir="auto" className="truncate text-2xl font-medium tracking-tight text-foreground md:text-5xl">{title}</h1>
              {leagueName && <p dir="auto" className="mt-1 text-sm text-muted-foreground md:text-base">{leagueName}</p>}
            </div>
          </div>
          <div data-nav-group className="flex flex-wrap gap-2 md:ms-auto">
          {sp && lg && <Pill onClick={() => go("league", { id: `${provider}~${sp}/${lg}`, name: leagueName })}><Trophy />{t("pages.team.league")}</Pill>}
          <Pill variant={followed ? "tonal" : "primary"} data-autofocus onClick={() => toggleFollow({ provider, teamId, name: title, badge: image, league: league ?? follow?.league })}>
            {followed ? <Check className="size-5" /> : <Plus className="size-5" />}{followed ? t("pages.team.unfollow") : t("pages.team.follow")}
          </Pill>
          </div>
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
        {upcoming.length > 0 && <div className="mt-3 flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-1.5" data-nav-group>{upcoming.map(row)}</div>}

        {results.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-medium text-foreground">{t("pages.sports.results")}</h2>
            <div className="mt-3 flex flex-col gap-0.5 rounded-2xl bg-surface-2 p-1.5" data-nav-group>{results.map(row)}</div>
          </>
        )}
      </div>
    </div>
    </Shell>
  )
}
