import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { LeenMark, RoundButton } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Plex shell: persistent left sidebar (logo, search, icon+label sources, profile, clock). Mobile: slim top bar + floating bottom nav. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile, tv } = useShellNav(page)
  const item = (k: string, label: string, Icon: (typeof tabs)[number]["icon"], route: string, home?: boolean) => (
    <button key={k} data-nav data-pill data-nav-home={home ? "" : undefined} data-autofocus={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="pw-nav">
      <Icon className="size-6 shrink-0" /><span className="truncate">{label}</span>
    </button>
  )
  return (
    <div className="pw-app relative flex h-full w-full overflow-hidden bg-background text-foreground">
      {mobile ? (
        <header className="pw-hdr absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-[var(--gx)]">
          <LeenMark className="size-8 shrink-0" />
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{title}</h1>
          <RoundButton label={t("pw.shell.search")} active={page === "search"} onClick={() => go("search")} className="bg-transparent"><Search /></RoundButton>
          <ProfileButton page={page} go={go} className="grid size-10 shrink-0 place-items-center rounded-full" avatarClass="size-8" />
        </header>
      ) : (
        <aside className="pw-side">
          <h1 className="sr-only">{title}</h1>
          <div aria-hidden className="pw-logo"><LeenMark className="size-8" />Leen</div>
          <nav data-nav-group="memory" aria-label={t("pw.shell.main")} className="flex flex-col gap-1">
            {item("search", t("pw.shell.search"), Search, "search")}
            {tabs.map(({ key: k, label, route, icon }) => item(k, label, icon, route, k === page))}
          </nav>
          <div className="mt-auto flex items-center gap-3 px-2">
            <ProfileButton page={page} go={go} className="grid size-11 shrink-0 place-items-center rounded-full" avatarClass="size-9" />
            <span className={cn("ms-auto text-muted-foreground tabular-nums", tv ? "text-xl" : "text-sm")}><Clock /></span>
          </div>
        </aside>
      )}
      <main data-page-content className={cn("relative min-h-0 min-w-0 flex-1 px-[var(--gx)]", tv ? "overflow-hidden" : "overflow-y-auto", mobile && "pt-[var(--hdr)] pb-[var(--float-nav-h)]")}>{children}</main>
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
