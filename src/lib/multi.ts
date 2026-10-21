import { create } from "zustand"
import { isTv } from "@/lib/device"

export const MULTI_MAX = isTv ? 2 : 4 // ponytail: TVs have 1-2 hardware decoders; raise if a set handles more. Most providers allow 1-3 connections per account; more tiles just show the "max connections" error

/** Channels in the Multiview page (item ids); kept for the session so coming back from full screen keeps the grid. */
export const useMulti = create<{ ids: string[]; add: (id: string) => void; remove: (id: string) => void }>((set) => ({
  ids: [],
  add: (id) => set((s) => (s.ids.includes(id) || s.ids.length >= MULTI_MAX ? s : { ids: [...s.ids, id] })),
  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
}))
