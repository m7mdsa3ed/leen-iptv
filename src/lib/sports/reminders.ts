import { useApp } from "@/lib/store"
import { notify, notifyOn } from "@/lib/notify"
import { useCatalog } from "@/lib/catalog"
import { catsOf, findLock } from "@/lib/merge-pure"
import { channelFor, type NoteRoute } from "@/lib/notify-pure"
import { SPORTS_PROVIDERS, type SportsGame } from "@/lib/api"
import { fmt, t } from "@/lib/i18n"
import { leagueIdOf, matchRoute, upcomingGames } from "./games"
import { sameDay, teamKey } from "./pure"

/* Every alert goes through notify() with a key, so it fires once per device (fired keys are device-local, in the inbox). */

/** Live channels the profile may open (PIN-locked categories left out). */
function openChannels() {
  const s = useApp.getState()
  const p = s.profiles.find((x) => x.id === s.profileId)
  const live = useCatalog.getState().byKind.live
  return p?.pin ? live.filter((i) => !catsOf(i).some((c) => findLock(p.locked, "live", c))) : live
}

/** One check: kickoff reminders, the daily digest, and kick-off / full-time alerts for followed games. */
export async function reminderTick() {
  const kick = notifyOn("kickoff"), digest = notifyOn("digest"), live = notifyOn("live"), fin = notifyOn("final")
  if (!kick && !digest && !live && !fin) return
  const s = useApp.getState()
  const follows = (s.profileId && s.data[s.profileId]?.follows) || []
  if (!follows.length) return
  const games = await upcomingGames(follows, s.settings.proxy, 1).catch(() => [] as SportsGame[])
  const now = Date.now()
  // a followed match on a channel in the catalog opens the player, else its match page
  const route = (g: SportsGame): NoteRoute | undefined => {
    const ch = channelFor(g.tv, openChannels())
    if (ch) return { name: "player", id: ch.id }
    const r = matchRoute(follows, g)
    return r && { name: "match", id: r.id }
  }

  if (kick) {
    const lead = Math.max(0, s.settings.sportsNotify?.lead ?? 15) * 60000
    for (const g of games) {
      if (g.status !== "scheduled" || !(g.startMs - lead <= now && now < g.startMs)) continue
      const mine = follows.find((x) => teamKey(x.teamId) === teamKey(g.home.id) || teamKey(x.teamId) === teamKey(g.away.id))
      notify(t("pages.sports.notifyTitle", { team: mine?.kind === "league" || !mine ? g.home.name : mine.name }), t("pages.sports.notifyBody", { home: g.home.name, away: g.away.name, time: fmt.time(g.startMs) }),
        { kind: "kickoff", key: `kickoff:${g.id}`, route: route(g) })
    }
  }

  if (digest) {
    const today = games.filter((g) => g.status === "scheduled" && g.startMs > now && sameDay(g.startMs, now))
    if (today.length) notify(fmt.plural("pages.sports.digestTitle", today.length), today.slice(0, 4).map((g) => t("pages.sports.digestLine", { home: g.home.name, away: g.away.name, time: fmt.time(g.startMs) })).join(", "),
      { kind: "digest", key: `digest:${new Date(now).toDateString()}`, route: { name: "sports" } })
  }

  // kick-off / full time: the cached month schedule is stale, so games around now are re-read from today's scoreboard (1 min cache)
  const near = (live || fin) ? games.filter((g) => g.startMs <= now + 5 * 60000 && now - g.startMs < 3 * 3600_000) : []
  if (!near.length) return
  const ids = new Set(near.map((g) => g.id))
  const leagues = [...new Set(near.map(leagueIdOf))]
  for (const prov of SPORTS_PROVIDERS.filter((p) => p.day && follows.some((f) => f.provider === p.id))) {
    const fresh = await prov.day!(leagues, now, { id: prov.id, enabled: true, proxy: s.settings.proxy }).catch(() => [] as SportsGame[])
    for (const g of fresh) {
      if (!ids.has(g.id)) continue
      if (live && g.status === "live") notify(t("pages.sports.liveTitle", { home: g.home.name, away: g.away.name }), g.league, { kind: "live", key: `live:${g.id}`, route: route(g) })
      if (fin && g.status === "final") notify(t("pages.sports.finalTitle"), t("pages.sports.finalBody", { home: g.home.name, away: g.away.name, hs: fmt.number(g.homeScore ?? 0), as: fmt.number(g.awayScore ?? 0) }), { kind: "final", key: `final:${g.id}`, route: route(g) })
    }
  }
}

let started = false
/** Check now and then every 60s while the app is open (and again whenever it becomes visible). */
export function startReminders() {
  if (started) return
  started = true
  const loop = () => { void reminderTick(); window.setTimeout(loop, 60000) }
  window.setTimeout(loop, 5000)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void reminderTick() })
}
