import { useCallback, useEffect, useRef, useState } from "react"
import { useApp, useFollows } from "@/lib/store"
import { forget } from "@/lib/meta/cache"
import { SPORTS_PROVIDERS, type SportsCompetition, type SportsGame, type SportsTeam } from "@/lib/api"
import { liveScores, upcomingGames, withAlts } from "./games"

const LIVE_MS = 30000 // poll live scores this often while a game is in play

/** Games of the picked profile's followed teams over `[now - back days, now + days]`, with live scores refreshed while
 *  a game is in play. `back = 0` is upcoming-only. `refresh` drops the cached scoreboards and re-fetches. */
export function useUpcomingGames(days = 30, back = 0) {
  const follows = useFollows()
  const proxy = useApp((s) => s.settings.proxy)
  const key = follows.map((f) => `${f.provider}:${f.teamId}`).sort().join(",")
  const [games, setGames] = useState<SportsGame[]>([])
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const gamesRef = useRef(games)
  gamesRef.current = games

  const refresh = useCallback(async () => { await forget(["sb:", "sbd:", "spg:", "st:", "sm:", "fm:"]); setNonce((n) => n + 1) }, [])

  // schedules: reloaded when the follows, the proxy or the window change (month scoreboards are cached by the provider)
  useEffect(() => {
    if (!follows.length) { setGames([]); return }
    let live = true
    setLoading(true)
    upcomingGames(follows, proxy, days, back)
      .then((g) => { if (live) { setGames(g); setLoading(false) } return withAlts(g, proxy) }) // paint, then fill from FotMob
      .then((g) => { if (live) setGames(g) })
      .catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [key, proxy, days, back, nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // live scores: poll while any shown game is in play (or starting / just started), refreshing it in place
  useEffect(() => {
    if (!follows.length) return
    let alive = true
    const tick = async () => {
      const now = Date.now()
      const cur = gamesRef.current
      if (!cur.some((g) => g.status === "live" || (g.status === "scheduled" && g.startMs - now < 5 * 60000))) return
      const live = await liveScores(follows, proxy).then((g) => withAlts(g, proxy)).catch(() => [] as SportsGame[])
      if (!alive || !live.length) return
      setGames((prev) => {
        const byId = new Map(prev.map((g) => [g.id, g]))
        for (const g of live) if (byId.has(g.id)) byId.set(g.id, g) // only refresh games already shown
        return [...byId.values()].sort((a, b) => a.startMs - b.startMs)
      })
    }
    void tick()
    const id = window.setInterval(() => void tick(), LIVE_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [key, proxy]) // eslint-disable-line react-hooks/exhaustive-deps

  return { games, loading, refresh }
}

/** Every game of these competitions on one local day (the Sports tab's "All games"); today is re-read every minute while shown (the provider caches it for 60s). */
export function useDayGames(ids: string[], dayMs: number, on: boolean) {
  const proxy = useApp((s) => s.settings.proxy)
  const prov = SPORTS_PROVIDERS.find((p) => p.day)
  const key = ids.join(",")
  const [state, setState] = useState<{ key: string; games: SportsGame[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const want = `${key}@${dayMs}`
  useEffect(() => {
    if (!on || !prov || !ids.length) return
    let live = true
    const show = (games: SportsGame[]) => { if (live) { setState({ key: want, games }); setLoading(false) } }
    // first load: paint the provider's day at once, then again with the gaps filled from FotMob (withAlts);
    // the minute refreshes swap in the merged rows only, so red cards / live minutes do not blink
    let filled = false
    const load = () => prov.day!(ids, dayMs, { id: prov.id, enabled: true, proxy }).then((g) => { if (!filled) show(g); return withAlts(g, proxy) })
      .then((g) => { filled = true; show(g) }, () => live && setLoading(false))
    setLoading(true)
    void load()
    const today = new Date(dayMs).toDateString() === new Date().toDateString()
    const id = today ? window.setInterval(() => void load(), 60000) : undefined
    return () => { live = false; if (id) window.clearInterval(id) }
  }, [want, on, proxy]) // eslint-disable-line react-hooks/exhaustive-deps
  return { games: state?.key === want ? state.games : [], loading: loading || (on && !!ids.length && state?.key !== want), provider: prov?.id ?? "" }
}

/** Search any team or tournament (debounced 400 ms after typing stops): shared by the Sports tab and Settings > Sports. */
export function useSportsSearch() {
  const proxy = useApp((s) => s.settings.proxy)
  const prov = SPORTS_PROVIDERS.find((p) => p.searchTeams)
  const [q, setQ] = useState("")
  const [res, setRes] = useState<{ q: string; teams: SportsTeam[]; comps: SportsCompetition[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const term = q.trim()
  useEffect(() => {
    if (!prov || term.length < 2) { setRes(null); setBusy(false); return }
    let live = true
    setBusy(true); setErr("")
    const id = window.setTimeout(async () => {
      try {
        const cfg = { id: prov.id, enabled: true, proxy }
        const [teams, comps] = await Promise.all([prov.searchTeams!(term, cfg), prov.searchCompetitions?.(term, cfg) ?? Promise.resolve([])])
        if (live) setRes({ q: term, teams, comps })
      } catch (e) { if (live) setErr(e instanceof Error ? e.message : String(e)) }
      finally { if (live) setBusy(false) }
    }, 400)
    return () => { live = false; window.clearTimeout(id) }
  }, [term, proxy]) // eslint-disable-line react-hooks/exhaustive-deps
  return { q, setQ, busy, err, teams: res?.teams ?? null, comps: res?.comps ?? null, provider: prov?.id ?? "" }
}
