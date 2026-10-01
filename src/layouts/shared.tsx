import { useMode } from "@/lib/device"
import { useRoute } from "@/lib/nav"
import { useProfile } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import { Avatar } from "@/components/gtv"
import { useLayoutDef } from "./index"

/** Common Shell state: tabs = the active layout's def.tabs; go(route) resets the stack (no-op on the current page); search is route "search", profile/settings is route "settings". */
export function useShellNav(page: string) {
  const reset = useRoute((s) => s.reset)
  const status = useCatalog((s) => s.status)
  const profile = useProfile()
  const mode = useMode()
  const tabs = useLayoutDef().tabs
  return { tabs, go: (k: string) => k !== page && reset(k), status, profile, mode, mobile: mode === "mobile", tv: mode === "tv" }
}

/** Profile avatar button (opens Settings). Marks itself data-autofocus on the settings page. */
export function ProfileButton({ page, go, className, avatarClass = "size-10" }: { page: string; go: (k: string) => void; className?: string; avatarClass?: string }) {
  const profile = useProfile()
  return (
    <button data-nav data-autofocus={page === "settings" ? "" : undefined} aria-label="Settings" onClick={() => go("settings")} className={className ?? "grid size-11 shrink-0 place-items-center rounded-full"}>
      <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} className={avatarClass} />
    </button>
  )
}
