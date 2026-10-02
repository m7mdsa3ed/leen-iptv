import { Clapperboard, Film, Heart, House, Search, Tv, type LucideIcon } from "lucide-react"
import { Avatar } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Roku OS: persistent text menu on the start side (Search, Home, Live TV, Movies, TV Shows, Favorites, Recent, Settings), clock + profile top end. Mobile: bottom bar. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { go, profile, mobile } = useShellNav(page)
  const reset = useRoute((s) => s.reset)
  // [route, active on page, label key, mobile icon (null = menu only)]
  const menu: [string, string, string, LucideIcon | null][] = [
    ["search", "search", "rk.menu.search", Search],
    ["home", "home", "rk.menu.home", House],
    ["live", "live", "rk.menu.live", Tv],
    ["movies", "movies", "rk.menu.movies", Film],
    ["series", "series", "rk.menu.shows", Clapperboard],
    ["library", "library", "rk.menu.favorites", Heart],
    ["history", "history", "rk.menu.recent", null],
    ["settings", "settings", "rk.menu.settings", null],
  ]
  const profileBtn = (
    <button data-nav data-pill aria-label={t("rk.shell.profile")} onClick={() => reset("profiles")} className="rk-avatar">
      <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} className="size-9" />
    </button>
  )
  return (
    <div className="rk-shell dark relative flex h-full w-full overflow-hidden text-foreground">
      {!mobile && (
        <nav aria-label={t("rk.shell.main")} data-nav-group="memory" className="rk-menu">
          {menu.map(([route, key, label]) => (
            <button key={route} data-nav data-nav-home={key === page ? "" : undefined} data-autofocus={key === page && page !== "home" ? "" : undefined} aria-current={key === page ? "page" : undefined} onClick={() => go(route)} className="rk-mi">
              {t(label)}
            </button>
          ))}
        </nav>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="rk-top">
          <h1 className={mobile ? "rk-top-title" : "sr-only"}>{title}</h1>
          <div className="ms-auto flex items-center gap-4">
            {mobile && <button data-nav aria-label={t("rk.menu.search")} onClick={() => go("search")} className="rk-avatar"><Search className="size-6" /></button>}
            {!mobile && <span dir="ltr" className="rk-clock"><Clock /></span>}
            {profileBtn}
          </div>
        </header>
        <main data-page-content className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      {mobile && (
        <nav data-nav-wrap aria-label={t("rk.shell.main")} className="rk-bar-nav">
          {menu.filter((m) => m[3] && m[0] !== "search").map(([route, key, label, Icon]) => (
            <button key={route} data-nav data-nav-home={key === page ? "" : undefined} aria-current={key === page ? "page" : undefined} onClick={() => go(route)} className="rk-bt">
              {Icon && <Icon className="size-6" />}<span>{t(label)}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
