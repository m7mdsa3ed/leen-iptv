import { create } from "zustand"

export const MULTI_MAX = 4 // ponytail: most providers allow 1-3 connections per account; more tiles just show the "max connections" error

/** Channels in the Multiview page (item ids); kept for the session so coming back from full screen keeps the grid. */
export const useMulti = create<{ ids: string[]; add: (id: string) => void; remove: (id: string) => void }>((set) => ({
  ids: [],
  add: (id) => set((s) => (s.ids.includes(id) || s.ids.length >= MULTI_MAX ? s : { ids: [...s.ids, id] })),
  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
}))
