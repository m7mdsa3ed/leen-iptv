import { useState } from "react"
import { Menu, Search, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { MetaQueueButton } from "@/components/tv/meta-queue"
import { InboxButton } from "@/components/tv/inbox"
import { Avatar, LeenMark, Pill, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { useBackStep } from "@/lib/nav"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, status, profile, mobile, tv } = useShellNav(page)
  const [menu, setMenu] = useState(false)
  useBackStep(menu, () => setMenu(false))
  const pick = (k: string) => { setMenu(false); go(k) }
  const PILL = 4 // ponytail: the pill holds 4 tabs + Menu; the rest live in the drawer
  const more = tabs.slice(PILL)
  const inMore = more.some((x) => x.key === page)
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
  const queue = <><MetaQueueButton /><InboxButton /></> // titles waiting for metadata (activity panel) + the notifications bell
  const state = <span className={cn("text-muted-foreground", tv ? "text-xl" : "text-sm")}>{status === "loading" ? t("gtv.shell.updating") + " " : ""}<Clock /></span>
  return (
    // bars, safe areas and their gradients: see "Bars and safe areas" in index.css (.topbar = exactly --hdr tall, .float-nav = floating pill inside --nav-h)
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="topbar">
        {mobile ? (
          <>
            <LeenMark className="size-8" />
            <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{title}</h1>
            {queue}
            {state}
            {search}
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
            <div className="ms-auto flex items-center gap-4">{queue}{state}{avatar}</div>
          </>
        )}
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pb-[var(--content-b)] pt-[var(--content-t)] [scroll-padding-top:var(--content-t)]", tv ? "overflow-hidden" : "overflow-y-auto")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap aria-label={t("gtv.shell.main")} className="float-nav">
          {tabs.slice(0, PILL).map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="float-tab">
              <Icon className="size-5" />{label}
            </button>
          ))}
          <button data-nav data-nav-home={inMore || page === "settings" ? "" : undefined} aria-current={inMore || page === "settings" ? "page" : undefined} aria-expanded={menu} onClick={() => setMenu(true)} className="float-tab">
            <Menu className="size-5" />{t("gtv.shell.menu")}
          </button>
        </nav>
      )}
      {mobile && menu && (
        <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.shell.menu")} className="fixed inset-0 z-50 flex items-end bg-black/50 m-fade" onClick={(e) => e.target === e.currentTarget && setMenu(false)}>
          <div className="m-rise w-full rounded-t-[28px] border-t border-[var(--fg-10)] bg-surface px-[var(--gx)] pb-[calc(var(--safe-b)+1rem)] pt-3 shadow-2xl">
            <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--fg-30)]" />
            <div className="flex items-center gap-3">
              <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} className="size-12 text-lg" />
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate text-lg font-medium">{profile?.name}</div>
                <div className="truncate text-sm text-muted-foreground">{state}</div>
              </div>
              <Pill data-autofocus className="min-h-10 px-4 text-sm" onClick={() => pick("profiles")}><Users />{t("gtv.shell.switchProfile")}</Pill>
            </div>
            {more.length > 0 && (
              <div data-nav-group className="mt-5 grid grid-cols-3 gap-2">
                {more.map(({ key: k, label, route, icon: Icon }) => (
                  <button key={k} data-nav aria-current={k === page ? "page" : undefined} onClick={() => pick(route)} className={cn("flex flex-col items-center gap-2 rounded-2xl py-3 text-sm", k === page ? "bg-accent-blue-container font-semibold" : "bg-surface-2 text-muted-foreground")}>
                    <Icon className="size-6" />{label}
                  </button>
                ))}
              </div>
            )}
            <button data-nav aria-current={page === "settings" ? "page" : undefined} onClick={() => pick("settings")} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-base">
              <Settings className="size-5 text-muted-foreground" />{t("common.settings")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
