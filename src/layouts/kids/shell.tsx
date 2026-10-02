import { Lock } from "lucide-react"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Kids (YouTube Kids style): left rail of big coloured tiles, tiny parent lock at its foot; mobile: the same tiles as a top strip. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { tabs, go, mobile } = useShellNav(page)
  const nav = (
    <>
      <span aria-hidden className="kd-logo">Leen</span>
      {tabs.map(({ key: k, label, route, icon: Icon }) => (
        <button key={k} data-nav data-k={k} data-nav-home={k === page ? "" : undefined} data-autofocus={k === page ? "" : undefined} data-active={k === page ? "" : undefined} aria-current={k === page ? "page" : undefined} onClick={() => go(route)} className="kd-tab"><Icon /><span>{label}</span></button>
      ))}
      <button data-nav data-nav-home={page === "settings" ? "" : undefined} aria-label={t("kd.shell.grownups")} onClick={() => go("settings")} className="kd-gear"><Lock /></button>
    </>
  )
  return (
    <div className={cn("kd-root flex h-full w-full overflow-hidden text-foreground", mobile ? "flex-col" : "flex-row")}>
      <h1 className="sr-only">{title}</h1>
      <nav data-nav-group="memory" className="kd-rail">{nav}</nav>
      <main data-page-content className="min-h-0 min-w-0 flex-1 overflow-y-auto px-[var(--gx)] pt-6">{children}</main>
    </div>
  )
}
