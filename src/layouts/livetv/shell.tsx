import { useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { LeenMark, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** YouTube TV top bar: logo, search icon, then Home / Live / Library, all start-aligned; clock + avatar at the end. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, status, mobile, tv } = useShellNav(page)
  const [solid, setSolid] = useState(false)
  const search = (
    <RoundButton label={t("lv.shell.search")} active={page === "search"} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className="bg-transparent"><Search /></RoundButton>
  )
  const avatar = <ProfileButton page={page} go={go} />
  const state = <span className={cn("text-muted-foreground", tv ? "text-xl" : "text-sm")}>{status === "loading" ? t("lv.shell.updating") + " " : ""}<Clock /></span>
  return (
    // scroll doesn't bubble: capture the vertical scrollers inside (rails scroll sideways, ignored) and fade a solid bar in (opacity only)
    <div onScrollCapture={(e) => { const t = e.target as HTMLElement; if (t.scrollHeight > t.clientHeight) setSolid(t.scrollTop > 40) }} className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="hdr-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-[calc(var(--hdr)+1.5rem)]" />
      <div aria-hidden className="lv-hdr-solid pointer-events-none absolute inset-x-0 top-0 z-20 h-[var(--hdr)] bg-background" style={{ opacity: solid ? 1 : 0 }} />
      <header className={cn("absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-[var(--gx)]", mobile ? "min-h-14 pt-[max(0.25rem,env(safe-area-inset-top))]" : tv ? "pb-2 pt-6" : "pb-2 pt-4")}>
        <h1 className="sr-only">{title}</h1>
        <LeenMark className={cn("me-1 shrink-0", mobile ? "size-8" : "size-10")} />
        {search}
        {!mobile && (
          <nav data-nav-wrap aria-label={t("lv.shell.main")} className="-m-3 ms-0 flex min-w-0 gap-1 overflow-x-auto p-3 no-scrollbar">
            {tabs.map(({ key: k, label, route }) => (
              <button key={k} data-nav data-pill data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} data-autofocus={k === page && page !== "home" ? "" : undefined} onClick={() => go(route)}
                className={cn("lv-tab min-h-11 px-4 py-2 text-base lg:px-6", k === page ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {label}
              </button>
            ))}
          </nav>
        )}
        <div className="ms-auto flex items-center gap-4">{state}{avatar}</div>
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", tv ? "overflow-hidden pb-6" : "overflow-y-auto pb-6", mobile && "pb-[var(--float-nav-h)]")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap aria-label={t("lv.shell.main")} className="float-nav">
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
