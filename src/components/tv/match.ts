import { create } from "zustand"
import type { Item } from "@/lib/types"

/** Open state of the "Match metadata" modal. Kept out of match-modal.tsx so Fast Refresh never duplicates the store (button and modal must share it). */
export const useMatch = create<{ item: Item | null }>(() => ({ item: null }))
export const openMatch = (item: Item) => useMatch.setState({ item })
export const closeMatch = () => useMatch.setState({ item: null })

/** Open state of the "Match logo" modal (live channels). */
export const useLogoMatch = create<{ item: Item | null }>(() => ({ item: null }))
export const openLogoMatch = (item: Item) => useLogoMatch.setState({ item })
export const closeLogoMatch = () => useLogoMatch.setState({ item: null })
