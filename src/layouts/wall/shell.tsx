import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { LeenMark, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Poster wall: thin in-flow top bar (wordmark, tabs, search, profile, clock). Mobile: slim bar + floating bottom nav. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile, tv } = useShellNav(page)
  const search = mobile ? (
    <RoundButton label={t("pw.shell.search")} active={page === "search"} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className="bg-transparent"><Search /></RoundButton>
  ) : (
    <button data-nav data-pill aria-label={t("pw.shell.search")} data-autofocus={page === "search" ? "" : undefined} onClick={() => go("search")} className={cn("pw-search flex min-h-10 items-center gap-2 rounded-full px-4 text-base text-muted-foreground", page === "search" ? "bg-surface-3" : "bg-surface-2")}>
      <Search className="size-5" /><span className="hidden pe-4 lg:inline">{t("pw.shell.search")}</span>
    </button>
  )
  const clock = <span className={cn("text-muted-foreground tabular-nums", tv ? "text-xl" : "text-sm")}><Clock /></span>
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="pw-hdr flex shrink-0 items-center gap-3 px-[var(--gx)]">
        <LeenMark className="size-8 shrink-0" />
        {mobile ? <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{title}</h1> : (
          <>
            <h1 className="sr-only">{title}</h1>
            <span aria-hidden className="pw-logo">Leen</span>
            <nav data-nav-wrap aria-label={t("pw.shell.main")} className="flex min-w-0 gap-1 overflow-x-auto no-scrollbar">
              {tabs.map(({ key: k, label, route }) => (
                <button key={k} data-nav data-pill data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="pw-tab">{label}</button>
              ))}
            </nav>
          </>
        )}
        <div className="ms-auto flex shrink-0 items-center gap-3">{clock}{search}<ProfileButton page={page} go={go} className="grid size-10 shrink-0 place-items-center rounded-full" avatarClass="size-8" /></div>
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pb-4", tv ? "overflow-hidden" : "overflow-y-auto", mobile && "pb-[var(--float-nav-h)]")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap aria-label={t("pw.shell.main")} className="float-nav">
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="float-tab"><Icon className="size-5" />{label}</button>
          ))}
        </nav>
      )}
    </div>
  )
}
