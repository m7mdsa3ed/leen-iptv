import { create } from "zustand"
import { useRoute } from "@/lib/nav"
import type { SectionKey } from "./sections"

// module state so the open section survives a layout switch; null = list only (mobile / Apple-style root).
// A module of its own: pages open a section without importing every section component (and the cycles that could bring).
export const useOpen = create<{ open: SectionKey | null; set: (k: SectionKey | null) => void }>((set) => ({ open: null, set: (open) => set({ open }) }))

/** Open Settings on one section (an "add a TMDB key" / "add teams" button): without it Settings opens on its first section and the user has to find the right one with the remote. */
export const openSection = (k: SectionKey) => { useOpen.setState({ open: k }); useRoute.getState().go("settings") }
