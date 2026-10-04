import type { ComponentType } from "react"
import { create } from "zustand"
import { t, useT } from "@/lib/i18n"
import { Cloud, Database, Globe, Info, Layers, LayoutGrid, MonitorPlay, MonitorSmartphone, Palette, Play, Trophy, UserRound, Wrench, type LucideIcon } from "lucide-react"
import AccountSection from "./sections/account"
import ProfilesSection from "./sections/profiles"
import SourcesSection from "./sections/sources"
import AppearanceSection from "./sections/appearance"
import BrowsingSection from "./sections/browsing"
import DeviceSection from "./sections/device"
import PlaybackSection from "./sections/playback"
import MetadataSection from "./sections/metadata"
import FixesSection from "./sections/fixes"
import SportsSection from "./sections/sports"
import HistorySection from "./sections/history"
import NetworkSection from "./sections/network"
import AboutSection from "./sections/about"

export type SectionKey = "account" | "profiles" | "sources" | "appearance" | "browsing" | "playback" | "device" | "metadata" | "fixes" | "sports" | "history" | "network" | "about"
export type SectionDef = { key: SectionKey; title: string; icon: LucideIcon; description: string; Component: ComponentType }

/** Spec order. Layouts build their navigation from this list. */
const def = (key: SectionKey, icon: LucideIcon, Component: ComponentType): SectionDef => ({
  key, icon, Component,
  get title() { return t(`settings.sec.${key}`) }, // getters: read the language at call time
  get description() { return t(`settings.sec.${key}.desc`) },
})

export const SECTIONS: SectionDef[] = [
  def("account", Cloud, AccountSection),
  def("profiles", UserRound, ProfilesSection),
  def("sources", Layers, SourcesSection),
  def("appearance", Palette, AppearanceSection),
  def("browsing", LayoutGrid, BrowsingSection),
  def("playback", Play, PlaybackSection),
  def("device", MonitorSmartphone, DeviceSection),
  def("metadata", MonitorPlay, MetadataSection),
  def("fixes", Wrench, FixesSection),
  def("sports", Trophy, SportsSection),
  def("history", Database, HistorySection),
  def("network", Globe, NetworkSection),
  def("about", Info, AboutSection),
]

// module state so the open section survives a layout switch; null = list only (mobile / Apple-style root)
const useOpen = create<{ open: SectionKey | null; set: (k: SectionKey | null) => void }>((set) => ({ open: null, set: (open) => set({ open }) }))

/** Selected-section helpers. `open` = pushed sub-screen (null shows the list); `key`/`section` fall back to the first section for two-pane layouts. */
export function useSettingsNav() {
  const { open, set } = useOpen()
  useT() // re-render on language change (section titles are getters)
  const key = open ?? SECTIONS[0].key
  return { sections: SECTIONS, open, key, section: SECTIONS.find((s) => s.key === key)!, select: (k: SectionKey) => set(k), close: () => set(null) }
}
