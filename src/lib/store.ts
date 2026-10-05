import { create } from "zustand"
import type { ColorThemeId } from "@/lib/themes"
import { persist } from "zustand/middleware"
import { LAYOUT_IDS } from "./layouts"
import type { ProviderCfg } from "./meta/types"
import { isTv } from "./device"
import { resolveLang, translate } from "./i18n/pure"
import { ar, en } from "./i18n/locales"
import type { LayoutId } from "./layouts"
import type { MetaMatch, Profile, Source, Watch } from "./types"
import type { Follow } from "./sports/types"
import type { SubsCfg } from "./subs-pure"
import type { More } from "./browse-pure"

/** A user-made group of live channels (name is its key within a profile). */
export type LiveList = { name: string; items: string[] }
type PData = { favs: string[]; recents: string[]; progress: Record<string, { pos: number; dur: number; t: number }>; lists?: LiveList[]; follows?: Follow[] }
export type Settings = { proxy: string; proxyStreams: boolean; liveExt: "m3u8" | "ts"; tvScale: number; trackHistory: boolean; accountChoice: "unset" | "guest" | "account"; theme: "system" | "dark" | "light"; colorTheme?: ColorThemeId; layout: LayoutId; motion: "full" | "reduced" | "off"; sourceBadges: boolean; language: "auto" | "en" | "ar"; keyboard?: "auto" | "on" | "off"; catNav?: "bar" | "sidebar"; cardSize?: "small" | "normal" | "large" | "xl"; cardInfo?: "show" | "hide"; startPage?: "home" | "live" | "movies" | "series" | "library"; homeOrder?: string[]; homeHide?: string[]; nextBanner?: boolean; miniPlayer?: boolean; autoNext?: boolean; noAutoShows?: string[]; meta?: ProviderCfg[]; metaMatch?: Record<string, MetaMatch>; logoMatch?: Record<string, string>; sharedMeta?: boolean; metaPosters?: boolean; groupMedia?: boolean; groupLive?: boolean; sportsNotify?: { enabled: boolean; lead: number }; subs?: SubsCfg }

const COLORS = ["#7c5cff", "#ef4444", "#10b981", "#f59e0b", "#06b6d4", "#ec4899"]
const empty = (): PData => ({ favs: [], recents: [], progress: {}, lists: [], follows: [] })
const uid = () => Math.random().toString(36).slice(2, 9)

interface S {
  profiles: Profile[]
  profileId: string | null
  sources: Source[]
  sourceId: string | null
  sourceFilter: string[] // session only (not persisted); [] = All
  catFilter: { movie: string[]; series: string[] } // session only; picked categories per browse page
  moreFilter: { movie: More; series: More } // session only; watch state / decade / rating per browse page
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
  setSourceFilter: (ids: string[]) => void
  setCatFilter: (kind: "movie" | "series", cats: string[]) => void
  setMoreFilter: (kind: "movie" | "series", f: More) => void
  toggleFav: (id: string) => void
  toggleFollow: (f: Follow) => void
  saveList: (name: string, items?: string[]) => void
  removeList: (name: string) => void
  toggleListChannel: (name: string, id: string) => void
  toggleLock: (key: string) => void
  pushRecent: (id: string) => void
  setProgress: (id: string, pos: number, dur: number, series?: string) => void
  markSeen: (entries: { id: string; dur?: number }[], seen: boolean) => void
  pullProgress: (list: Watch[]) => void
  setSettings: (p: Partial<Settings>) => void
}

const upd = (s: S, f: (d: PData) => PData) => {
  const p = s.profileId
  return p ? { data: { ...s.data, [p]: f(s.data[p] ?? empty()) } } : {}
}

export const useApp = create<S>()(
  persist(
    (set) => ({
      profiles: [{ id: "p1", name: translate({ en, ar }, resolveLang("auto", typeof navigator === "undefined" ? "en" : navigator.language), "common.me"), color: COLORS[0], locked: [] }],
      profileId: null,
      sources: [],
      sourceId: null,
      sourceFilter: [],
      catFilter: { movie: [], series: [] },
      moreFilter: { movie: {}, series: {} },
      data: {},
      settings: { proxy: "", proxyStreams: false, liveExt: "m3u8", tvScale: 1, trackHistory: true, accountChoice: "unset", theme: "system", layout: "googletv", motion: isTv ? "reduced" : "full", sourceBadges: true, language: "auto" },
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
          return { sources, sourceId: s.sourceId === id ? (sources[0]?.id ?? null) : s.sourceId, sourceFilter: s.sourceFilter.filter((x) => x !== id) }
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
      setSourceFilter: (ids) => set({ sourceFilter: ids }),
      setCatFilter: (kind, cats) => set((s) => ({ catFilter: { ...s.catFilter, [kind]: cats } })),
      setMoreFilter: (kind, f) => set((s) => ({ moreFilter: { ...s.moreFilter, [kind]: f } })),
      toggleFav: (id) => set((s) => upd(s, (d) => ({ ...d, favs: d.favs.includes(id) ? d.favs.filter((x) => x !== id) : [id, ...d.favs] }))),
      // follow/unfollow one team for this profile (synced as a t/ entity, tombstoned when removed)
      toggleFollow: (f) => set((s) => upd(s, (d) => {
        const follows = d.follows ?? []
        const same = (x: Follow) => x.provider === f.provider && x.teamId === f.teamId
        return { ...d, follows: follows.some(same) ? follows.filter((x) => !same(x)) : [f, ...follows] }
      })),
      saveList: (name, items = []) => set((s) => upd(s, (d) => {
        const lists = d.lists ?? []
        return { ...d, lists: lists.some((l) => l.name === name) ? lists.map((l) => (l.name === name ? { ...l, items } : l)) : [...lists, { name, items }] }
      })),
      removeList: (name) => set((s) => upd(s, (d) => ({ ...d, lists: (d.lists ?? []).filter((l) => l.name !== name) }))),
      toggleListChannel: (name, id) => set((s) => upd(s, (d) => ({
        ...d, lists: (d.lists ?? []).map((l) => (l.name === name ? { ...l, items: l.items.includes(id) ? l.items.filter((x) => x !== id) : [...l.items, id] } : l)),
      }))),
      toggleLock: (key) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === s.profileId ? { ...p, locked: p.locked.includes(key) ? p.locked.filter((k) => k !== key) : [...p.locked, key] } : p,
          ),
        })),
      pushRecent: (id) => set((s) => upd(s, (d) => ({ ...d, recents: [id, ...d.recents.filter((x) => x !== id)].slice(0, 40) }))),
      // an episode also writes the series entry (last episode wins) so Continue watching, which lists catalog items, can show the series
      setProgress: (id, pos, dur, series) => set((s) => upd(s, (d) => { const p = { pos, dur, t: Date.now() }; return { ...d, progress: { ...d.progress, [id]: p, ...(series ? { [series]: p } : {}) } } })),
      // ponytail: "unseen" = position 0 (not a delete) so sync's last-writer-wins carries it and server resume is not re-seeded
      markSeen: (entries, seen) => set((s) => upd(s, (d) => {
        const progress = { ...d.progress }, t = Date.now()
        for (const e of entries) { const dur = progress[e.id]?.dur || e.dur || 1; progress[e.id] = { pos: seen ? dur : 0, dur, t } }
        return { ...d, progress }
      })),
      // server watch history (Plex/Jellyfin): replaces only an older local entry (same rule as sync); a series takes its newest episode, like setProgress
      pullProgress: (list) => set((s) => upd(s, (d) => {
        const progress = { ...d.progress }
        const put = (id: string, w: Watch) => { if ((progress[id]?.t ?? -1) < w.t) progress[id] = { pos: w.pos, dur: w.dur, t: w.t } }
        for (const w of list) { put(w.id, w); if (w.series) put(w.series, w) }
        return { ...d, progress }
      })),
      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
    }),
    {
      name: "iptv-app",
      version: 1,
      partialize: (s) => ({ ...s, profileId: undefined, sourceFilter: undefined, catFilter: undefined, moreFilter: undefined }), // always re-pick profile on launch
      // the picked profile survives a refresh (sessionStorage) but a fresh launch asks again
      merge: (saved, cur) => {
        const m = { ...cur, ...(saved as object) } as S
        m.settings = { ...cur.settings, ...m.settings } // settings saved by older versions lack new keys
        if (!LAYOUT_IDS.includes(m.settings.layout)) m.settings.layout = "googletv" // removed layouts
        let id: string | null = null
        try { id = sessionStorage.getItem("iptv-profile") } catch { /* ignore */ }
        m.sourceFilter = []
        m.catFilter = { movie: [], series: [] }
        m.moreFilter = { movie: {}, series: {} }
        return { ...m, profileId: m.profiles.some((p) => p.id === id) ? id : null }
      },
    },
  ),
)

export const useProfile = () => useApp((s) => s.profiles.find((p) => p.id === s.profileId) ?? null)
export const usePData = (): PData => useApp((s) => (s.profileId && s.data[s.profileId]) || EMPTY)
const EMPTY = empty()
const EMPTY_LISTS: LiveList[] = []
/** The picked profile's custom live lists (stable reference; empty array when there is none). */
export const useLists = (): LiveList[] => useApp((s) => (s.profileId && s.data[s.profileId]?.lists) || EMPTY_LISTS)
const EMPTY_FOLLOWS: Follow[] = []
/** The picked profile's followed teams (stable reference; empty array when there is none). */
export const useFollows = (): Follow[] => useApp((s) => (s.profileId && s.data[s.profileId]?.follows) || EMPTY_FOLLOWS)
export const useSource = () => useApp((s) => s.sources.find((x) => x.id === s.sourceId) ?? null)
