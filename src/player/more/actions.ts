import type { Item } from "@/lib/types"

/** What the More panel can ask the player to do. Stable object (Player keeps the latest closures in a ref). */
export type MoreActions = {
  close: () => void
  closed: () => void
  /** switch playback; keepOpen = stay in the panel (live channels) */
  play: (item: Item, queue?: Item[], keepOpen?: boolean) => void
  /** leave the player for the Detail / Person page */
  details: (id: string) => void
  person: (c: { id?: string; name: string }) => void
  trailer: (t: { key: string; name: string }) => void
}
