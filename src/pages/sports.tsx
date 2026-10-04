import { Pill, Rail } from "@/components/gtv"
import { GameCard } from "@/components/tv/sports"
import { Empty, Shell } from "@/components/tv/ui"
import { useFollows } from "@/lib/store"
import { useUpcomingGames } from "@/lib/sports/use-games"
import { gameRoute, teamInGame } from "@/lib/sports/games"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import type { SportsGame } from "@/lib/api"

const BACK = 30 // days of recent results to show

/** Sports tab: the followed teams' games (live now, upcoming, then recent results). Open a game to reach its team page. */
export default function Sports() {
  const t = useT()
  const follows = useFollows()
  const { games, refresh } = useUpcomingGames(60, BACK)
  const go = useRoute((s) => s.go)
  const open = (g: SportsGame) => { const r = gameRoute(follows, g); if (r) go("team", r) }
  const live = games.filter((g) => g.status === "live")
  const upcoming = games.filter((g) => g.status === "scheduled")
  const results = games.filter((g) => g.status === "final").sort((a, b) => b.startMs - a.startMs)
  const card = (g: SportsGame) => <GameCard key={g.id} g={g} mineId={teamInGame(follows, g)} onOpen={() => open(g)} />

  return (
    <Shell page="sports" title={t("pages.sports.title")}>
      {!follows.length ? (
        <Empty>
          <div className="flex flex-col items-center gap-4">
            <div className="max-w-md text-center">{t("pages.sports.none")}</div>
            <Pill variant="primary" onClick={() => go("settings")}>{t("pages.sports.addTeams")}</Pill>
          </div>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex justify-end"><Pill onClick={() => void refresh()}>{t("pages.sports.refresh")}</Pill></div>
          {live.length > 0 && <Rail title={t("pages.sports.live")}>{live.map(card)}</Rail>}
          {upcoming.length > 0 && <Rail title={t("pages.sports.upcoming")}>{upcoming.map(card)}</Rail>}
          {results.length > 0 && <Rail title={t("pages.sports.results")}>{results.map(card)}</Rail>}
          {games.length === 0 && <p className="text-muted-foreground">{t("pages.sports.noGames")}</p>}
        </div>
      )}
    </Shell>
  )
}
