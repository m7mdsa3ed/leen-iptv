import { useEffect, useState } from "react"
import { ChevronDown, ChevronLeft } from "lucide-react"
import { Avatar, RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { useBackStep } from "@/lib/nav"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { useT } from "@/lib/i18n"
import { useSettingsNav } from "@/settings/sections"
import { SettingsOutlet } from "@/settings/outlet"
import { cn } from "@/lib/utils"
import "../settings.css"

// whichever element scrolls runs under the bars (index.css "Bars and safe areas"): the sidebar and the outlet, or on mobile the whole screen
const UNDER = "under-top under-bottom"

/** Google TV settings: the section sidebar (shared by every settings page) with the open section in the outlet; mobile = the section full width, the list in a bottom sheet. */
export default function Settings() {
  const t = useT()
  const { groups, open, key, section, select, close, parent } = useSettingsNav()
  const mobile = useMode() === "mobile"
  const p = useProfile()
  const email = useSync().session?.email
  const [sheet, setSheet] = useState(mobile && open === null) // mobile: Settings opened without a section starts on the list
  useBackStep(sheet, () => setSheet(false))
  const pick = (k: Parameters<typeof select>[0]) => { setSheet(false); select(k) }

  // Back / Esc from a child section on mobile returns to its parent first (capture: runs before the app's Back handler); a top section leaves Settings
  useEffect(() => {
    if (!mobile || !parent || sheet) return
    const h = (e: KeyboardEvent) => {
      if ((e.keyCode === 461 || e.keyCode === 27) && !(e.keyCode === 27 && e.target instanceof HTMLInputElement) && !document.querySelector("[data-modal]")) { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    window.addEventListener("keydown", h, true)
    return () => window.removeEventListener("keydown", h, true)
  }, [mobile, parent, sheet, close])

  const sidebar = (
    <nav data-nav-group="memory" aria-label={t("gtv.settings.title")} className={cn("gtv-set-list", !mobile && UNDER)}>
      {p && (
        <button data-nav className="gtv-set-account text-start" onClick={() => pick("account")}>
          <Avatar name={p.name} color={p.color} photo={p.photo} className="size-14 text-2xl" />
          <div className="min-w-0">
            <div className="truncate text-xl font-medium">{p.name}</div>
            <div className="truncate text-sm text-muted-foreground">{email || t("gtv.settings.signIn")}</div>
          </div>
        </button>
      )}
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <h3 className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
          {group.sections.map((s) => {
            const on = s.key === key && (!mobile || open !== null)
            return (
              <div key={s.key} className="flex flex-col gap-1">
                <button data-nav data-nav-home={on ? "" : undefined} data-autofocus={on && open !== null ? "" : undefined} aria-current={on ? "true" : undefined} className="gtv-set-item" onClick={() => pick(s.key)}>
                  <s.icon className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1 text-start"><span className="block truncate">{s.title}</span><span className="gtv-set-desc">{s.description}</span></span>
                </button>
                {s.children?.map((child) => {
                  const childOn = child.key === key && (!mobile || open !== null)
                  return <button key={child.key} data-nav data-nav-home={childOn ? "" : undefined} data-autofocus={childOn && open !== null ? "" : undefined} aria-current={childOn ? "true" : undefined} className="gtv-set-item ms-8 min-h-11 py-1 text-base" onClick={() => pick(child.key)}><child.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1 text-start"><span className="block truncate">{child.title}</span><span className="gtv-set-desc">{child.description}</span></span></button>
                })}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <Shell page="settings" title={t("gtv.settings.title")}>
      <div className={cn("gtv-set h-full", mobile && UNDER)}>
        {!mobile && sidebar}
        <div className={cn("gtv-set-body", !mobile && UNDER)}>
          {mobile ? (
            <div className="mb-5 flex items-center gap-2">
              {parent && <RoundButton label={t("gtv.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
              <button data-nav aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)} className="flex min-h-12 min-w-0 items-center gap-3 rounded-full bg-surface-2 pe-4 ps-5 text-lg font-medium">
                <section.icon className="size-5 shrink-0" /><span className="truncate">{parent ? `${parent.title} / ${section.title}` : section.title}</span><ChevronDown className="size-5 shrink-0 opacity-60" />
              </button>
            </div>
          ) : (
            <h2 className="mb-5 text-3xl font-medium tracking-tight">{parent ? `${parent.title} / ${section.title}` : section.title}</h2>
          )}
          <SettingsOutlet />
        </div>
      </div>
      {mobile && sheet && (
        <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.settings.title")} className="fixed inset-0 z-50 flex items-end bg-black/50 m-fade" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="m-rise no-scrollbar max-h-[85vh] w-full overflow-y-auto rounded-t-[28px] border-t border-[var(--fg-10)] bg-surface px-[var(--gx)] pb-[calc(var(--safe-b)+1rem)] pt-3 shadow-2xl">
            <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--fg-30)]" />
            {sidebar}
          </div>
        </div>
      )}
    </Shell>
  )
}
