import { useCallback, useEffect, useRef, useState } from "react"
import { useApp, useFollows } from "@/lib/store"
import { forget } from "@/lib/meta/cache"
import type { SportsGame } from "@/lib/api"
import { liveScores, upcomingGames } from "./games"

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

  const refresh = useCallback(async () => { await forget(["sb:", "spg:"]); setNonce((n) => n + 1) }, [])

  // schedules: reloaded when the follows, the proxy or the window change (month scoreboards are cached by the provider)
  useEffect(() => {
    if (!follows.length) { setGames([]); return }
    let live = true
    setLoading(true)
    upcomingGames(follows, proxy, days, back)
      .then((g) => { if (live) { setGames(g); setLoading(false) } })
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
      const live = await liveScores(follows, proxy).catch(() => [] as SportsGame[])
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
