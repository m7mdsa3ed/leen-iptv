import type { ComponentType } from "react"
import { t, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { Bell, Captions, Cloud, FileText, History, Info, Layers, LayoutGrid, MonitorSmartphone, Palette, Play, Trophy, UserRound, Wrench, type LucideIcon } from "lucide-react"
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
import NotificationsSection from "./sections/notifications"
import HistorySection from "./sections/history"
import AboutSection from "./sections/about"

export type SectionKey = "account" | "profiles" | "sources" | "appearance" | "browsing" | "playback" | "subtitles" | "device" | "metadata" | "fixes" | "sports" | "notifications" | "history" | "about"
export type SectionGroup = "account" | "library" | "playback" | "display" | "system"
export type SectionDef = { key: SectionKey; group: SectionGroup; parent?: SectionKey; children?: SectionDef[]; title: string; icon: LucideIcon; description: string; Component: ComponentType }
/** Sidebar groups, top to bottom: who you are, what you watch, how it plays, how it looks, the device. Members come from each section's `group`, in SECTIONS order. */
export const SECTION_GROUPS: { key: SectionGroup; title: string }[] = [
  { key: "account", title: "settings.group.account" },
  { key: "library", title: "settings.group.library" },
  { key: "playback", title: "settings.group.playback" },
  { key: "display", title: "settings.group.display" },
  { key: "system", title: "settings.group.system" },
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
  def("sources", "library", Layers, SourcesSection),
  def("metadata", "library", FileText, MetadataSection),
  def("fixes", "library", Wrench, FixesSection),
  def("sports", "library", Trophy, SportsSection),
  def("notifications", "library", Bell, NotificationsSection),
  def("playback", "playback", Play, PlaybackSection),
  def("subtitles", "playback", Captions, SubtitlesSection, "playback"),
  def("history", "playback", History, HistorySection),
  def("appearance", "display", Palette, AppearanceSection),
  def("browsing", "display", LayoutGrid, BrowsingSection),
  def("device", "system", MonitorSmartphone, DeviceSection),
  def("about", "system", Info, AboutSection),
]
export const groupedSections = () => SECTION_GROUPS.map((g) => ({ ...g, title: t(g.title), sections: SECTIONS.filter((s) => s.group === g.key && !s.parent).map((s) => ({ ...s, children: SECTIONS.filter((child) => child.parent === s.key) })) }))

/**
 * Selected-section helpers. Every settings screen is one route (`#/settings/<sec>`): the layout wraps the section in its
 * outlet, and the sidebar (or the mobile list) points at it. `open` = the section in the URL, null = the list alone;
 * an unknown one falls back to the first section, so a stale link still lands somewhere sensible.
 */
export function useSettingsNav() {
  const sec = useRoute((s) => s.stack[s.stack.length - 1].p?.sec) as SectionKey | undefined
  const replace = useRoute((s) => s.replace)
  useT() // re-render on language change (section titles are getters)
  const known = SECTIONS.some((s) => s.key === sec)
  const current = SECTIONS.find((s) => s.key === sec) ?? SECTIONS[0]
  const parent = current.parent ? SECTIONS.find((s) => s.key === current.parent) ?? null : null
  return {
    sections: SECTIONS, groups: groupedSections(), open: known ? current.key : null, key: current.key, section: current, parent,
    select: (k: SectionKey) => { if (k !== current.key || !known) replace("settings", { sec: k }) },
    // "up one level": a child section goes back to its parent, anything else to the list
    close: () => replace("settings", parent ? { sec: parent.key } : undefined),
  }
}
