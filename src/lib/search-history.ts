import { create } from "zustand"

/** Recent search queries (device-local, newest first). Shared by the search palette and the on-screen keyboard's suggestion row. */
const KEY = "leen-search-history"
const MAX = 12
const load = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, MAX) : [] } catch { return [] }
}
const save = (list: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* private mode / quota: history is a nicety */ } }

export const useSearchHistory = create<{ list: string[]; add: (q: string) => void; remove: (q: string) => void; clear: () => void }>((set, get) => ({
  list: load(),
  add: (q) => { q = q.trim(); if (q.length < 2) return; const list = [q, ...get().list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX); save(list); set({ list }) },
  remove: (q) => { const list = get().list.filter((x) => x !== q); save(list); set({ list }) },
  clear: () => { save([]); set({ list: [] }) },
}))
