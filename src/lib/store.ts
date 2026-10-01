import { create } from "zustand"
import { persist } from "zustand/middleware"
import { LAYOUT_IDS } from "./layouts"
import type { ProviderCfg } from "./meta/types"
import { isTv } from "./device"
import type { LayoutId } from "./layouts"
import type { Profile, Source } from "./types"

type PData = { favs: string[]; recents: string[]; progress: Record<string, { pos: number; dur: number; t: number }> }
export type Settings = { proxy: string; proxyStreams: boolean; liveExt: "m3u8" | "ts"; tvScale: number; trackHistory: boolean; accountChoice: "unset" | "guest" | "account"; theme: "system" | "dark" | "light"; layout: LayoutId; motion: "full" | "reduced" | "off"; sourceBadges: boolean; meta?: ProviderCfg[] }

const COLORS = ["#7c5cff", "#ef4444", "#10b981", "#f59e0b", "#06b6d4", "#ec4899"]
const empty = (): PData => ({ favs: [], recents: [], progress: {} })
const uid = () => Math.random().toString(36).slice(2, 9)

interface S {
  profiles: Profile[]
  profileId: string | null
  sources: Source[]
  sourceId: string | null
  sourceFilter: string | null // session only (not persisted); null = All
  data: Record<string, PData>
  settings: Settings
  addProfile: (name: string, pin?: string) => void
  updateProfile: (id: string, p: Partial<Profile>) => void
  removeProfile: (id: string) => void
  setProfile: (id: string | null) => void
  addSource: (s: Omit<Source, "id">) => Source
  removeSource: (id: string) => void
  setSource: (id: string) => void
  updateSource: (id: string, p: Partial<Omit<Source, "id">>) => void
  moveSource: (id: string, dir: -1 | 1) => void // priority order
  setSourceFilter: (id: string | null) => void
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
      sourceFilter: null,
      data: {},
      settings: { proxy: "", proxyStreams: false, liveExt: "m3u8", tvScale: 1, trackHistory: true, accountChoice: "unset", theme: "system", layout: "googletv", motion: isTv ? "reduced" : "full", sourceBadges: true },
      addProfile: (name, pin) =>
        set((s) => ({ profiles: [...s.profiles, { id: uid(), name, pin, color: COLORS[s.profiles.length % COLORS.length], locked: [] }] })),
      updateProfile: (id, p) => set((s) => ({ profiles: s.profiles.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      removeProfile: (id) => set((s) => ({ profiles: s.profiles.filter((x) => x.id !== id), profileId: s.profileId === id ? null : s.profileId })),
      setProfile: (id) => {
        try { id ? sessionStorage.setItem("iptv-profile", id) : sessionStorage.removeItem("iptv-profile") } catch { /* private mode */ }
        set({ profileId: id })
      },
      addSource: (src) => {
        const s = { ...src, id: uid(), enabled: src.enabled ?? true }
        set((st) => ({ sources: [...st.sources, s], sourceId: s.id }))
        return s
      },
      removeSource: (id) =>
        set((s) => {
          const sources = s.sources.filter((x) => x.id !== id)
          return { sources, sourceId: s.sourceId === id ? (sources[0]?.id ?? null) : s.sourceId, sourceFilter: s.sourceFilter === id ? null : s.sourceFilter }
        }),
      setSource: (id) => set({ sourceId: id }),
      updateSource: (id, p) => set((s) => ({ sources: s.sources.map((x) => (x.id === id ? { ...x, ...p } : x)) })),
      moveSource: (id, dir) =>
        set((s) => {
          const a = [...s.sources], i = a.findIndex((x) => x.id === id), j = i + dir
          if (i < 0 || j < 0 || j >= a.length) return {}
          ;[a[i], a[j]] = [a[j], a[i]]
          return { sources: a }
        }),
      setSourceFilter: (id) => set({ sourceFilter: id }),
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
      partialize: (s) => ({ ...s, profileId: undefined, sourceFilter: undefined }), // always re-pick profile on launch
      // the picked profile survives a refresh (sessionStorage) but a fresh launch asks again
      merge: (saved, cur) => {
        const m = { ...cur, ...(saved as object) } as S
        m.settings = { ...cur.settings, ...m.settings } // settings saved by older versions lack new keys
        if (!LAYOUT_IDS.includes(m.settings.layout)) m.settings.layout = (m.settings.layout as string) === "cinema" ? "netflix" : "googletv" // renamed / removed layouts
        let id: string | null = null
        try { id = sessionStorage.getItem("iptv-profile") } catch { /* ignore */ }
        m.sourceFilter = null
        return { ...m, profileId: m.profiles.some((p) => p.id === id) ? id : null }
      },
    },
  ),
)

export const useProfile = () => useApp((s) => s.profiles.find((p) => p.id === s.profileId) ?? null)
export const usePData = (): PData => useApp((s) => (s.profileId && s.data[s.profileId]) || EMPTY)
const EMPTY = empty()
export const useSource = () => useApp((s) => s.sources.find((x) => x.id === s.sourceId) ?? null)
