import { create } from "zustand"
import { KEY } from "@/lib/nav"
import type { Item } from "@/lib/types"

/** Open state of the custom-list modal. `item` given = pick/toggle lists for that channel; none = manage lists only. */
type Cur = { item?: Item }
export const useListModal = create<{ cur: Cur | null }>(() => ({ cur: null }))
export const openListModal = (item?: Item) => useListModal.setState({ cur: { item } })
export const closeListModal = () => useListModal.setState({ cur: null })

/**
 * Key / pointer handlers for a live channel row: red toggles favorite, green (TV) and right-click / long-press (pointer)
 * open the list picker. Spread onto a channel button/tile. No-op for non-live items.
 */
export const liveRowMenu = (item: Item, mode: string, onFav: (i: Item) => void) => ({
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.keyCode === KEY.red) onFav(item)
    else if (item.kind === "live" && e.keyCode === KEY.green) { e.preventDefault(); e.stopPropagation(); openListModal(item) }
  },
  onContextMenu: (e: React.MouseEvent) => {
    if (item.kind === "live" && mode !== "tv") { e.preventDefault(); openListModal(item) }
  },
})
