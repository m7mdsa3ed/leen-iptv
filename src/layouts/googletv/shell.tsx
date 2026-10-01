import { useState } from "react"
import { Mic, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { LeenMark, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

export default function Shell({ page, title, children }: ShellProps) {
  const { tabs, go, status, mobile, tv } = useShellNav(page)
  const [solid, setSolid] = useState(false)
  const search = mobile ? (
    <RoundButton label="Search" active={page === "search"} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className="bg-transparent">
      <Search />
    </RoundButton>
  ) : (
    <button data-nav data-pill aria-label="Search" data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className={cn("flex min-h-11 items-center gap-3 rounded-full px-4 text-base text-muted-foreground", page === "search" ? "bg-surface-3" : "bg-surface-2")}>
      <Search className="size-5" /><span className="hidden pr-6 lg:inline">Search</span><Mic className="size-5" />
    </button>
  )
  const avatar = <ProfileButton page={page} go={go} />
  const state = <span className={cn("text-muted-foreground", tv ? "text-xl" : "text-sm")}>{status === "loading" ? "Updating... " : ""}<Clock /></span>
  return (
    // scroll doesn't bubble: capture the vertical scrollers inside (rails scroll sideways, ignored) and fade a solid bar in (opacity only)
    <div onScrollCapture={(e) => { const t = e.target as HTMLElement; if (t.scrollHeight > t.clientHeight) setSolid(t.scrollTop > 40) }} className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="hdr-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-[calc(var(--hdr)+1.5rem)]" />
      <div aria-hidden className="gtv-hdr-solid pointer-events-none absolute inset-x-0 top-0 z-20 h-[var(--hdr)] bg-background" style={{ opacity: solid ? 1 : 0 }} />
      <header className={cn("absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-[var(--gx)]", mobile ? "min-h-14 pt-[max(0.25rem,env(safe-area-inset-top))]" : tv ? "pb-2 pt-6" : "pb-2 pt-4")}>
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
            <LeenMark className="mr-1 size-10" />
            {search}
            <nav data-nav-wrap className="-m-3 ml-0 flex min-w-0 gap-1 overflow-x-auto p-3 no-scrollbar">
              {tabs.map(({ key: k, label, route }) => (
                <button key={k} data-nav data-pill data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} data-autofocus={k === page ? "" : undefined} onClick={() => go(route)}
                  className={cn("gtv-tab min-h-11 rounded-full px-3 py-2 text-base font-medium lg:px-5", k === page ? "text-foreground" : "text-muted-foreground hover:bg-[var(--fg-10)] hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4">{state}{avatar}</div>
          </>
        )}
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", tv ? "overflow-hidden pb-6" : "overflow-y-auto pb-6")}>{children}</main>
      {mobile && (
        <nav className="flex shrink-0 bg-surface pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} onClick={() => go(route)} className={cn("flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] [@media(max-height:500px)]:h-12", k === page ? "text-foreground" : "text-muted-foreground")}>
              <span className={cn("grid h-8 w-16 place-items-center rounded-full", k === page && "bg-accent-blue-container")}><Icon className="size-5" /></span>
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
