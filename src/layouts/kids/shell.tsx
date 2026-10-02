import { Lock } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Kids: big wordmark + 4 big tabs; a small lock button (right) opens Settings behind the grown-up gate. Mobile: tabs move to a bottom bar. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile } = useShellNav(page)
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header data-nav-wrap className="kd-hdr absolute inset-x-0 top-0 z-30 flex items-center gap-4 px-[var(--gx)]" style={{ height: "var(--hdr)" }}>
        <h1 className="sr-only">{title}</h1>
        <span aria-hidden className="kd-logo">Leen</span>
        {!mobile && (
          <nav className="flex min-w-0 items-center gap-3">
            {tabs.map(({ key: k, label, route, icon: Icon }) => (
              <button key={k} data-nav data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} data-active={k === page ? "" : undefined} onClick={() => go(route)} className="kd-tab"><Icon />{label}</button>
            ))}
          </nav>
        )}
        <button data-nav data-nav-home={page === "settings" ? "" : undefined} aria-label={t("kd.shell.grownups")} onClick={() => go("settings")} className="kd-gear ms-auto"><Lock /></button>
      </header>
      <main data-page-content className={cn("min-h-0 flex-1 overflow-y-auto px-[var(--gx)] pt-[var(--hdr)] [scroll-padding-top:var(--hdr)]", mobile && "pb-[var(--float-nav-h)]")}>{children}</main>
      {mobile && (
        <nav data-nav-wrap className="float-nav">
          {tabs.map(({ key: k, label, route, icon: Icon }) => (
            <button key={k} data-nav data-nav-home={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="float-tab"><Icon className="size-6" />{label}</button>
          ))}
        </nav>
      )}
    </div>
  )
}
