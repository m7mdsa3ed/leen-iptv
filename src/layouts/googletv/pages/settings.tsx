import { useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Avatar, RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { useT } from "@/lib/i18n"
import { useSettingsNav } from "@/settings/sections"
import { cn } from "@/lib/utils"
import "../settings.css"

// whichever element scrolls runs under the bars (index.css "Bars and safe areas"): the two panes, or on mobile the whole screen
const UNDER = "under-top under-bottom"

/** Google TV settings: large section list (left) + section cards (right); mobile = list that opens the section. */
export default function Settings() {
  const t = useT()
  const { groups, open, key, section, select, close, parent } = useSettingsNav()
  const mobile = useMode() === "mobile"
  const p = useProfile()
  const email = useSync().session?.email
  const C = section.Component
  const showBody = !mobile || open !== null

  // Back / Esc from a mobile sub-screen returns to the list first (capture: runs before the app's Back handler)
  useEffect(() => {
    if (!mobile || !open) return
    const h = (e: KeyboardEvent) => {
      if ((e.keyCode === 461 || e.keyCode === 27) && !(e.keyCode === 27 && e.target instanceof HTMLInputElement) && !document.querySelector("[data-modal]")) { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    window.addEventListener("keydown", h, true)
    return () => window.removeEventListener("keydown", h, true)
  }, [mobile, open, close])

  const list = (
    <nav data-nav-group="memory" aria-label={t("gtv.settings.title")} className={cn("gtv-set-list", !mobile && UNDER)}>
      {p && (
        <button data-nav className="gtv-set-account text-start" onClick={() => select("account")}>
          <Avatar name={p.name} color={p.color} className="size-14 text-2xl" />
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
            const on = !mobile && s.key === key
            return (
              <div key={s.key} className="flex flex-col gap-1">
                <button data-nav data-nav-home={on ? "" : undefined} aria-current={on ? "true" : undefined} className="gtv-set-item" onClick={() => select(s.key)}>
                  <s.icon className="size-6 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-start">{s.title}</span>
                  {mobile && <ChevronRight className="rtl-flip size-5 shrink-0 opacity-60" />}
                </button>
                {s.children?.map((child) => {
                  const childOn = !mobile && child.key === key
                  return <button key={child.key} data-nav data-nav-home={childOn ? "" : undefined} aria-current={childOn ? "true" : undefined} className="gtv-set-item ms-8 min-h-11 py-1 text-base" onClick={() => select(child.key)}><child.icon className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate text-start">{child.title}</span>{mobile && <ChevronRight className="rtl-flip size-5 shrink-0 opacity-60" />}</button>
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
        {(!mobile || !open) && list}
        {showBody && (
          <div key={key} className={cn("gtv-set-body", !mobile && UNDER)}>
            <h2 className="mb-5 flex items-center gap-3 text-3xl font-medium tracking-tight">
              {mobile && <RoundButton label={t("gtv.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
              {parent ? `${parent.title} / ${section.title}` : section.title}
            </h2>
            <C />
          </div>
        )}
      </div>
    </Shell>
  )
}
