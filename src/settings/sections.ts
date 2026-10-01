import type { ComponentType } from "react"
import { create } from "zustand"
import { Cloud, Database, Globe, Info, Layers, MonitorPlay, Palette, Play, UserRound, type LucideIcon } from "lucide-react"
import AccountSection from "./sections/account"
import ProfilesSection from "./sections/profiles"
import SourcesSection from "./sections/sources"
import DisplaySection from "./sections/display"
import PlaybackSection from "./sections/playback"
import MetadataSection from "./sections/metadata"
import HistorySection from "./sections/history"
import NetworkSection from "./sections/network"
import AboutSection from "./sections/about"

export type SectionKey = "account" | "profiles" | "sources" | "display" | "playback" | "metadata" | "history" | "network" | "about"
export type SectionDef = { key: SectionKey; title: string; icon: LucideIcon; description: string; Component: ComponentType }

/** Spec order. Layouts build their navigation from this list. */
export const SECTIONS: SectionDef[] = [
  { key: "account", title: "Account & sync", icon: Cloud, description: "Sign in and sync your profiles and sources", Component: AccountSection },
  { key: "profiles", title: "Profiles & PIN", icon: UserRound, description: "Switch profile, PIN and parental locks", Component: ProfilesSection },
  { key: "sources", title: "Sources", icon: Layers, description: "Add, order, color and refresh your sources", Component: SourcesSection },
  { key: "display", title: "Display", icon: Palette, description: "Layout, theme, motion and size", Component: DisplaySection },
  { key: "playback", title: "Playback", icon: Play, description: "Live format, proxy streams and history tracking", Component: PlaybackSection },
  { key: "metadata", title: "Metadata", icon: MonitorPlay, description: "TMDB, OMDb and Xtream info providers", Component: MetadataSection },
  { key: "history", title: "History & stats", icon: Database, description: "View, export or clear what you watched", Component: HistorySection },
  { key: "network", title: "Network", icon: Globe, description: "CORS proxy", Component: NetworkSection },
  { key: "about", title: "About", icon: Info, description: "Version, device and source health", Component: AboutSection },
]

// module state so the open section survives a layout switch; null = list only (mobile / Apple-style root)
const useOpen = create<{ open: SectionKey | null; set: (k: SectionKey | null) => void }>((set) => ({ open: null, set: (open) => set({ open }) }))

/** Selected-section helpers. `open` = pushed sub-screen (null shows the list); `key`/`section` fall back to the first section for two-pane layouts. */
export function useSettingsNav() {
  const { open, set } = useOpen()
  const key = open ?? SECTIONS[0].key
  return { sections: SECTIONS, open, key, section: SECTIONS.find((s) => s.key === key)!, select: (k: SectionKey) => set(k), close: () => set(null) }
}
