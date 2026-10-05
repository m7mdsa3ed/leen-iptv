import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { LeenMark, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, status, mobile, tv } = useShellNav(page)
  const search = mobile ? (
    <RoundButton label={t("gtv.shell.search")} active={page === "search"} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className="bg-transparent">
      <Search />
    </RoundButton>
  ) : (
    <button data-nav data-pill aria-label={t("gtv.shell.search")} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className={cn("flex min-h-11 items-center gap-3 rounded-full px-4 text-base text-muted-foreground", page === "search" ? "bg-surface-3" : "bg-surface-2")}>
      <Search className="size-5" /><span className="hidden pe-6 lg:inline">{t("gtv.shell.search")}</span>
    </button>
  )
  const avatar = <ProfileButton page={page} go={go} />
  const state = <span className={cn("text-muted-foreground", tv ? "text-xl" : "text-sm")}>{status === "loading" ? t("gtv.shell.updating") + " " : ""}<Clock /></span>
  return (
    // bars, safe areas and their gradients: see "Bars and safe areas" in index.css (.topbar = exactly --hdr tall, .float-nav = --nav-h)
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="topbar">
        {mobile ? (
          <>
            <LeenMark className="size-8" />
            <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{title}</h1>
            {state}
            {search}
            {avatar}
          </>
        ) : (
          <>
            <h1 className="sr-only">{title}</h1>
            <LeenMark className="me-1 size-10" />
            {search}
            <nav data-nav-wrap aria-label={t("gtv.shell.main")} className="-m-3 ms-0 flex min-w-0 gap-1 overflow-x-auto p-3 no-scrollbar">
              {tabs.map(({ key: k, label, route }) => (
                <button key={k} data-nav data-pill data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} data-autofocus={k === page ? "" : undefined} onClick={() => go(route)}
                  className={cn("gtv-tab min-h-11 rounded-full px-3 py-2 text-base font-medium lg:px-5", k === page ? "text-foreground" : "text-muted-foreground hover:bg-[var(--fg-10)] hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="ms-auto flex items-center gap-4">{state}{avatar}</div>
          </>
        )}
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pb-[var(--content-b)] pt-[var(--content-t)] [scroll-padding-top:var(--content-t)]", tv ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap aria-label={t("gtv.shell.main")} className="float-nav">
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
