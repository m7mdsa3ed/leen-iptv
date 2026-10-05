import { useApp } from "@/lib/store"
import { notify } from "@/lib/notify"
import { fmt, t } from "@/lib/i18n"
import { upcomingGames } from "./games"
import { teamKey } from "./pure"

/* Fired reminders are device-local (in localStorage, never synced) so two devices each get their own heads-up. */
const FKEY = "leen-sports-fired"
let fired: Record<string, number> | null = null
const load = (): Record<string, number> => {
  let f = fired
  if (!f) {
    try { f = JSON.parse(localStorage.getItem(FKEY) || "{}") as Record<string, number> } catch { f = {} }
    fired = f
  }
  return f
}
const save = () => { try { localStorage.setItem(FKEY, JSON.stringify(fired ?? {})) } catch { /* ignore */ } }

/** One check: for every followed game whose kickoff-minus-lead has just passed, fire once. */
export async function reminderTick() {
  const s = useApp.getState()
  const cfg = s.settings.sportsNotify
  if (!cfg?.enabled) return
  const follows = (s.profileId && s.data[s.profileId]?.follows) || []
  if (!follows.length) return
  const games = await upcomingGames(follows, s.settings.proxy, 1).catch(() => [])
  const lead = Math.max(0, cfg.lead) * 60000
  const now = Date.now()
  const f = load()
  let changed = false
  for (const k in f) if (now - f[k] > 2 * 864e5) { delete f[k]; changed = true } // drop fired marks older than two days
  for (const g of games) {
    if (g.status !== "scheduled" || f[g.id]) continue
    if (g.startMs - lead <= now && now < g.startMs) {
      f[g.id] = now; changed = true
      const mine = follows.find((x) => teamKey(x.teamId) === teamKey(g.home.id) || teamKey(x.teamId) === teamKey(g.away.id))
      notify(t("pages.sports.notifyTitle", { team: mine?.kind === "league" || !mine ? g.home.name : mine.name }), t("pages.sports.notifyBody", { home: g.home.name, away: g.away.name, time: fmt.time(g.startMs) }))
    }
  }
  if (changed) save()
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
