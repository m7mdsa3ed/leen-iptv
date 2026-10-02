import { ArrowLeft } from "lucide-react"
import { Avatar } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import { useShellNav } from "../shared"
import type { ShellProps } from "../types"

/** Roku: minimal header (Home pill on inner pages, Leen mark on Home; clock + profile avatar right), no tabs. */
export default function Shell({ page, title, children }: ShellProps) {
  const t = useT()
  const { go, profile, mobile } = useShellNav(page)
  const reset = useRoute((s) => s.reset)
  return (
    <div className="rk-shell relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="rk-hdr flex shrink-0 items-center gap-4 px-[var(--gx)]" style={{ height: "var(--hdr)" }}>
        <h1 className="sr-only">{title}</h1>
        {page === "home" ? <span aria-hidden className="rk-logo">Leen</span> : (
          <button data-nav data-nav-home data-pill onClick={() => go("home")} className="rk-back"><ArrowLeft className="rtl-flip" />{t("rk.shell.home")}</button>
        )}
        <div className="ms-auto flex items-center gap-4">
          {!mobile && <span dir="ltr" className="rk-clock"><Clock /></span>}
          <button data-nav data-pill aria-label={t("rk.shell.profile")} onClick={() => reset("profiles")} className="rk-avatar">
            <Avatar name={profile?.name ?? "?"} color={profile?.color ?? "#5f6368"} className="size-10" />
          </button>
        </div>
      </header>
      <main data-page-content className="min-h-0 flex-1 overflow-hidden px-[var(--gx)]">{children}</main>
    </div>
  )
}
