import type { ComponentType } from "react"
import { t, useT } from "@/lib/i18n"
import { Cloud, Database, Globe, Info, Layers, LayoutGrid, MonitorPlay, MonitorSmartphone, Palette, Play, Trophy, UserRound, Wrench, type LucideIcon } from "lucide-react"
import { useOpen } from "./open"
import AccountSection from "./sections/account"
import ProfilesSection from "./sections/profiles"
import SourcesSection from "./sections/sources"
import AppearanceSection from "./sections/appearance"
import BrowsingSection from "./sections/browsing"
import DeviceSection from "./sections/device"
import PlaybackSection from "./sections/playback"
import SubtitlesSection from "./sections/subtitles"
import MetadataSection from "./sections/metadata"
import FixesSection from "./sections/fixes"
import SportsSection from "./sections/sports"
import HistorySection from "./sections/history"
import NetworkSection from "./sections/network"
import AboutSection from "./sections/about"

export type SectionKey = "account" | "profiles" | "sources" | "appearance" | "browsing" | "playback" | "subtitles" | "device" | "metadata" | "fixes" | "sports" | "history" | "network" | "about"
export type SectionGroup = "account" | "experience" | "content" | "system"
export type SectionDef = { key: SectionKey; group: SectionGroup; parent?: SectionKey; children?: SectionDef[]; title: string; icon: LucideIcon; description: string; Component: ComponentType }
export const SECTION_GROUPS: { key: SectionGroup; title: string; sections: SectionKey[] }[] = [
  { key: "account", title: "settings.group.account", sections: ["account", "profiles", "sources"] },
  { key: "experience", title: "settings.group.experience", sections: ["appearance", "browsing", "device"] },
  { key: "content", title: "settings.group.content", sections: ["playback", "metadata", "fixes", "sports", "history"] },
  { key: "system", title: "settings.group.system", sections: ["network", "about"] },
]

/** Spec order. Layouts build their navigation from this list. */
const def = (key: SectionKey, group: SectionGroup, icon: LucideIcon, Component: ComponentType, parent?: SectionKey): SectionDef => ({
  key, group, icon, Component, parent,
  get title() { return t(`settings.sec.${key}`) }, // getters: read the language at call time
  get description() { return t(`settings.sec.${key}.desc`) },
})

export const SECTIONS: SectionDef[] = [
  def("account", "account", Cloud, AccountSection),
  def("profiles", "account", UserRound, ProfilesSection),
  def("sources", "account", Layers, SourcesSection),
  def("appearance", "experience", Palette, AppearanceSection),
  def("browsing", "experience", LayoutGrid, BrowsingSection),
  def("device", "experience", MonitorSmartphone, DeviceSection),
  def("playback", "content", Play, PlaybackSection),
  def("subtitles", "content", MonitorSmartphone, SubtitlesSection, "playback"),
  def("metadata", "content", MonitorPlay, MetadataSection),
  def("fixes", "content", Wrench, FixesSection),
  def("sports", "content", Trophy, SportsSection),
  def("history", "content", Database, HistorySection),
  def("network", "system", Globe, NetworkSection),
  def("about", "system", Info, AboutSection),
]
export const groupedSections = () => SECTION_GROUPS.map((g) => ({ ...g, title: t(g.title), sections: SECTIONS.filter((s) => s.group === g.key && !s.parent).map((s) => ({ ...s, children: SECTIONS.filter((child) => child.parent === s.key) })) }))

/** Selected-section helpers. `open` = pushed sub-screen (null shows the list); `key`/`section` fall back to the first section for two-pane layouts. */
export function useSettingsNav() {
  const { open, set } = useOpen()
  useT() // re-render on language change (section titles are getters)
  const key = open ?? SECTIONS[0].key
  const current = SECTIONS.find((s) => s.key === key)!
  return { sections: SECTIONS, groups: groupedSections(), open, key, section: current, select: (k: SectionKey) => set(k), close: () => set(current.parent ?? null), parent: current.parent ? SECTIONS.find((s) => s.key === current.parent) : null }
}
