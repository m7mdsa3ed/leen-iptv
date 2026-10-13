import { useRoute } from "@/lib/nav"
import type { SectionKey } from "./sections"

/**
 * Open Settings on one section (an "add a TMDB key" / "add teams" button): without it Settings opens on its first section
 * and the user has to find the right one with the remote. The section is the route's param, so the sidebar is not re-created.
 */
export const openSection = (k: SectionKey) => {
  const r = useRoute.getState()
  if (r.stack[r.stack.length - 1]?.name === "settings") r.replace("settings", { sec: k })
  else r.go("settings", { sec: k })
}
