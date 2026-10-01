import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ProviderCfg } from "./meta/types"
import type { Profile, Source } from "./types"

type PData = { favs: string[]; recents: string[]; progress: Record<string, { pos: number; dur: number; t: number }> }
export type Settings = { proxy: string; proxyStreams: boolean; liveExt: "m3u8" | "ts"; tvScale: number; theme: "system" | "dark" | "light"; meta?: ProviderCfg[] }

const COLORS = ["#7c5cff", "#ef4444", "#10b981", "#f59e0b", "#06b6d4", "#ec4899"]
const empty = (): PData => ({ favs: [], recents: [], progress: {} })
const uid = () => Math.random().toString(36).slice(2, 9)

interface S {
  profiles: Profile[]
  profileId: string | null
  sources: Source[]
  sourceId: string | null
  data: Record<string, PData>
  settings: Settings
  addProfile: (name: string, pin?: string) => void
  updateProfile: (id: string, p: Partial<Profile>) => void
  removeProfile: (id: string) => void
  setProfile: (id: string | null) => void
  addSource: (s: Omit<Source, "id">) => Source
  removeSource: (id: string) => void
  setSource: (id: string) => void
  toggleFav: (id: string) => void
  toggleLock: (key: string) => void
  pushRecent: (id: string) => void
  setProgress: (id: string, pos: number, dur: number) => void
  setSettings: (p: Partial<Settings>) => void
}

const upd = (s: S, f: (d: PData) => PData) => {
  const p = s.profileId
  return p ? { data: { ...s.data, [p]: f(s.data[p] ?? empty()) } } : {}
}

export const useApp = create<S>()(
  persist(
    (set) => ({
      profiles: [{ id: "p1", name: "Me", color: COLORS[0], locked: [] }],
      profileId: null,
      sources: [],
      sourceId: null,
      data: {},
      settings: { proxy: "", proxyStreams: false, liveExt: "m3u8", tvScale: 1, theme: "system" },
      addProfile: (name, pin) =>
        set((s) => ({ profiles: [...s.profiles, { id: uid(), name, pin, color: COLORS[s.profiles.length % COLORS.length], locked: [] }] })),
      updateProfile: (id, p) => set((s) => ({ profiles: s.profiles.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      removeProfile: (id) => set((s) => ({ profiles: s.profiles.filter((x) => x.id !== id), profileId: s.profileId === id ? null : s.profileId })),
      setProfile: (id) => {
        try { id ? sessionStorage.setItem("iptv-profile", id) : sessionStorage.removeItem("iptv-profile") } catch { /* private mode */ }
        set({ profileId: id })
      },
      addSource: (src) => {
        const s = { ...src, id: uid() }
        set((st) => ({ sources: [...st.sources, s], sourceId: s.id }))
        return s
      },
      removeSource: (id) =>
        set((s) => {
          const sources = s.sources.filter((x) => x.id !== id)
          return { sources, sourceId: s.sourceId === id ? (sources[0]?.id ?? null) : s.sourceId }
        }),
      setSource: (id) => set({ sourceId: id }),
      toggleFav: (id) => set((s) => upd(s, (d) => ({ ...d, favs: d.favs.includes(id) ? d.favs.filter((x) => x !== id) : [id, ...d.favs] }))),
      toggleLock: (key) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === s.profileId ? { ...p, locked: p.locked.includes(key) ? p.locked.filter((k) => k !== key) : [...p.locked, key] } : p,
          ),
        })),
      pushRecent: (id) => set((s) => upd(s, (d) => ({ ...d, recents: [id, ...d.recents.filter((x) => x !== id)].slice(0, 40) }))),
      setProgress: (id, pos, dur) => set((s) => upd(s, (d) => ({ ...d, progress: { ...d.progress, [id]: { pos, dur, t: Date.now() } } }))),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    {
      name: "iptv-app",
      version: 1,
      partialize: (s) => ({ ...s, profileId: undefined }), // always re-pick profile on launch
      // the picked profile survives a refresh (sessionStorage) but a fresh launch asks again
      merge: (saved, cur) => {
        const m = { ...cur, ...(saved as object) } as S
        m.settings = { ...cur.settings, ...m.settings } // settings saved by older versions lack new keys
        let id: string | null = null
        try { id = sessionStorage.getItem("iptv-profile") } catch { /* ignore */ }
        return { ...m, profileId: m.profiles.some((p) => p.id === id) ? id : null }
      },
    },
  ),
)

export const useProfile = () => useApp((s) => s.profiles.find((p) => p.id === s.profileId) ?? null)
export const usePData = (): PData => useApp((s) => (s.profileId && s.data[s.profileId]) || EMPTY)
const EMPTY = empty()
export const useSource = () => useApp((s) => s.sources.find((x) => x.id === s.sourceId) ?? null)
