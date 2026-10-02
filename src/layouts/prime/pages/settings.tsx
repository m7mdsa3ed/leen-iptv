import { useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Avatar, RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { useT } from "@/lib/i18n"
import { useSettingsNav } from "@/settings/sections"

/** Settings: section list (start) + shared section body (end); mobile = list that opens the section. Same behaviour as the Google TV page, Prime styling. */
export default function Settings() {
  const t = useT()
  const { sections, open, key, section, select, close } = useSettingsNav()
  const mobile = useMode() === "mobile"
  const p = useProfile()
  const email = useSync().session?.email
  const C = section.Component

  // Back / Esc from a mobile sub-screen returns to the list first (capture: runs before the app's Back handler)
  useEffect(() => {
    if (!mobile || !open) return
    const h = (e: KeyboardEvent) => {
      if ((e.keyCode === 461 || e.keyCode === 27) && !(e.keyCode === 27 && e.target instanceof HTMLInputElement) && !document.querySelector("[data-modal]")) { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    window.addEventListener("keydown", h, true)
    return () => window.removeEventListener("keydown", h, true)
  }, [mobile, open, close])

  return (
    <Shell page="settings" title={t("common.settings")}>
      <div className="pv-set">
        {(!mobile || !open) && (
          <nav data-nav-group="memory" aria-label={t("common.settings")} className="pv-set-list">
            {p && (
              <button data-nav className="pv-set-account" onClick={() => select("account")}>
                <Avatar name={p.name} color={p.color} className="size-12 text-xl" />
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{p.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{email || t("pv.settings.signIn")}</div>
                </div>
              </button>
            )}
            {sections.map((s) => {
              const on = !mobile && s.key === key
              return (
                <button key={s.key} data-nav data-nav-home={on ? "" : undefined} aria-current={on ? "true" : undefined} className="pv-set-item" onClick={() => select(s.key)}>
                  <s.icon className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-start">{s.title}</span>
                  {mobile && <ChevronRight className="rtl-flip size-5 shrink-0 opacity-60" />}
                </button>
              )
            })}
          </nav>
        )}
        {(!mobile || open !== null) && (
          <div className="pv-set-body">
            <h2 className="mb-5 flex items-center gap-3 text-3xl font-bold tracking-tight">
              {mobile && <RoundButton label={t("common.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
              {section.title}
            </h2>
            <C />
          </div>
        )}
      </div>
    </Shell>
  )
}
