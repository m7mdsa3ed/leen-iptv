import type { Item } from "@/lib/types"

/** What the voice agent may do to the player that is on screen. The Player registers itself (use-player.ts); there is at most one. */
export type PlayerCtl = {
  id: string
  live: boolean
  paused: boolean
  play: () => void
  pause: () => void
  seek: (seconds: number) => void
  next: () => void
  prev: () => void
  stop: () => void
  playItem: (i: Item, list?: Item[], start?: boolean) => void
}

let get: (() => PlayerCtl) | null = null
/** Register the running player; the getter always returns the latest closures. Returns the unregister function. */
export const registerPlayer = (g: () => PlayerCtl) => { get = g; return () => { if (get === g) get = null } }
export const playerCtl = () => get?.() ?? null
