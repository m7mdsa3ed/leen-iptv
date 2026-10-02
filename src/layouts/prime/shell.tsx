import { Search } from "lucide-react"
import { Clock } from "@/components/tv/ui"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { ProfileButton, useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Prime: dark navy bar, "Leen" wordmark + text tabs on the start side (active = accent underline), search / avatar / clock at the end. Mobile: slim bar + floating bottom nav. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile, tv } = useShellNav(page)
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header data-nav-wrap className={cn("pv-hdr", mobile && "pt-[env(safe-area-inset-top)]")} style={{ height: "var(--hdr)" }}>
        <h1 className="sr-only">{title}</h1>
        <span aria-hidden className="pv-logo">Leen</span>
        {!mobile && (
          <nav className="flex min-w-0 items-center gap-1">
            {tabs.map(({ key: k, label, route }) => (
              <button key={k} data-nav data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className={cn("pv-tab", tv && "text-lg")}>{label}</button>
            ))}
          </nav>
        )}
        <div className="ms-auto flex items-center gap-1">
          <button data-nav data-autofocus={page === "search" ? "" : undefined} data-nav-home={page === "search" ? "" : undefined} aria-label={t("common.search")} onClick={() => go("search")} className="pv-ibtn"><Search className="size-6" /></button>
          {!mobile && <span className={cn("px-2 text-muted-foreground", tv ? "text-xl" : "text-sm")}><Clock /></span>}
          <ProfileButton page={page} go={go} avatarClass="size-9" />
        </div>
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", tv ? "overflow-hidden" : "overflow-y-auto", mobile && "pb-[var(--float-nav-h)]")}>{children}</main>
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
