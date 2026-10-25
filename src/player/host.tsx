import { useEffect } from "react"
import { create } from "zustand"
import { useRoute } from "@/lib/nav"
import type { Item } from "@/lib/types"
import Player from "./player"

type Q = { queue: Item[]; index: number }
type Host = {
  s: (Q & { key: number; start?: boolean }) | null // the running playback session (one Player instance per key)
  cur: Q | null // what that Player is on now (it can zap / change episode)
  paused: boolean // the player shows a still frame (paused, no sheet over it): the screen saver may take the screen
}
export const usePlayerHost = create<Host>(() => ({ s: null, cur: null, paused: false }))
let n = 0

/** Stop playback for good (leaving the player, stop key, sleep timer, last episode ended). */
export const closePlayer = () => usePlayerHost.setState({ s: null, cur: null, paused: false })

/** The `player` route: starts a session in the host; leaving the route stops it. */
export function PlayerRoute({ queue, index, start }: Q & { start?: boolean }) {
  useEffect(() => {
    usePlayerHost.setState({ s: { key: ++n, queue, index, start }, cur: { queue, index }, paused: false })
    return closePlayer
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Rendered once beside the page stack: the full-screen player while the `player` route is on top. A page opened over it
 *  (Details, a person) stops playback. */
export function PlayerHost() {
  const s = usePlayerHost((x) => x.s)
  const full = useRoute((r) => r.stack[r.stack.length - 1]?.name === "player")
  useEffect(() => { if (s && !full) closePlayer() }, [s, full])
  if (!s || !full) return null
  return <div className="fixed inset-0"><Player key={s.key} queue={s.queue} index={s.index} start={s.start} /></div>
}
