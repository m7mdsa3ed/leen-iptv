import { Search } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { LeenMark } from "@/components/gtv"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** tvOS: no header bar. A floating glass capsule (tabs + search) is centred at the top, the profile circle sits at the far right.
 *  Mobile: slim wordmark row (search + profile) and a bottom tab bar. The header never animates; only <main data-page-content> does. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile, tv } = useShellNav(page)
  const searchBtn = (cls: string) => (
    <button data-nav data-pill aria-label={t("common.search")} aria-current={page === "search" ? "page" : undefined} data-autofocus={page === "search" ? "" : undefined} data-nav-home={page === "search" ? "" : undefined} onClick={() => go("search")} className={cn("atv-tab grid place-items-center rounded-full", cls)}>
      <Search className="size-5" />
    </button>
  )
  const avatar = <ProfileButton page={page} go={go} className="atv-round pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full" avatarClass="size-9" />
  return (
    <div className="atv-root relative flex h-full w-full flex-col overflow-hidden text-foreground">
      <header className={cn("pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center px-[var(--gx)]", mobile ? "min-h-14 pt-[max(0.25rem,env(safe-area-inset-top))]" : tv ? "pt-6" : "pt-4")}>
        {mobile ? (
          <div className="pointer-events-auto flex w-full items-center gap-1">
            <LeenMark className="size-7" />
            <span className="atv-wordmark wordmark ms-1 min-w-0 flex-1 truncate">Leen</span>
            <h1 className="sr-only">{title}</h1>
            {searchBtn("atv-glass size-11")}
            <span className="w-1" />
            {avatar}
          </div>
        ) : (
          <div data-nav-wrap className="contents">
            <h1 className="sr-only">{title}</h1>
            <nav className="atv-glass atv-capsule pointer-events-auto flex items-center gap-1 rounded-full p-1.5">
              {tabs.map(({ key: k, label, route, icon: Icon }) => (
                <button key={k} data-nav data-pill data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)}
                  className="atv-tab inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-2 text-base font-semibold lg:px-6">
                  <Icon className="size-5 lg:hidden" /><span className="sr-only lg:not-sr-only">{label}</span>
                </button>
              ))}
              {searchBtn("size-11")}
            </nav>
            <div className="absolute end-[var(--gx)]">{avatar}</div>
          </div>
        )}
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", tv ? "overflow-hidden pb-6" : "overflow-y-auto pb-6", mobile && "pb-[var(--float-nav-h)]")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap className="float-nav">
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="float-tab">
              <Icon className="size-5" />{label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
