import { useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Avatar, Pill, RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useProfile } from "@/lib/store"
import { useSettingsNav } from "@/settings/sections"
import { SettingsOutlet } from "@/settings/outlet"
import { cn } from "@/lib/utils"

/** Default Settings: the section sidebar (shared by every settings page) with the open section in the outlet; mobile = list, then section. */
export default function SettingsPage() {
  const { groups, open, key, section, select, close, parent } = useSettingsNav()
  const t = useT()
  const mobile = useMode() === "mobile"
  const p = useProfile()

  // Back / Esc from a section on mobile returns to the list first (capture: runs before the app's Back handler)
  useEffect(() => {
    if (!mobile || !open) return
    const h = (e: KeyboardEvent) => {
      if ((e.keyCode === 461 || e.keyCode === 27) && !(e.keyCode === 27 && e.target instanceof HTMLInputElement) && !document.querySelector("[data-modal]")) { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
    window.addEventListener("keydown", h, true)
    return () => window.removeEventListener("keydown", h, true)
  }, [mobile, open, close])

  const sidebar = (
    <nav data-nav-group="memory" aria-label={t("settings.title")} className={cn("under-top under-bottom flex flex-col gap-2 overflow-y-auto p-1", !mobile && "shrink-0 md:w-72")}>
      {p && (
        <div className="mb-2 flex items-center gap-3 px-4 py-2">
          <Avatar name={p.name} color={p.color} className="size-12 text-xl" />
          <div dir="auto" className="min-w-0 truncate text-lg font-medium">{p.name}</div>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <h3 className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
          {group.sections.map((s) => {
            const on = !mobile && s.key === key
            return (
              <div key={s.key} className="flex flex-col gap-1">
                <Pill data-nav-home={on ? "" : undefined} data-autofocus={on && open !== null ? "" : undefined} aria-current={on ? "true" : undefined} variant={on ? "primary" : "ghost"} className="h-14 justify-start gap-4 px-5 text-lg" onClick={() => select(s.key)}>
                  <s.icon />{s.title}
                  {mobile && <ChevronRight className="rtl-flip ms-auto size-5 shrink-0 opacity-60" />}
                </Pill>
                {s.children?.map((child) => {
                  const childOn = !mobile && child.key === key
                  return <Pill key={child.key} data-nav-home={childOn ? "" : undefined} data-autofocus={childOn && open !== null ? "" : undefined} aria-current={childOn ? "true" : undefined} variant={childOn ? "tonal" : "ghost"} className="ms-8 h-11 justify-start gap-3 px-4 text-base" onClick={() => select(child.key)}><child.icon className="size-4" />{child.title}{mobile && <ChevronRight className="rtl-flip ms-auto size-5 shrink-0 opacity-60" />}</Pill>
                })}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <Shell page="settings" title={t("settings.title")}>
      <div className="flex h-full min-h-0 gap-8">
        {(!mobile || !open) && sidebar}
        {(!mobile || open) && (
          <div className={cn("under-top under-bottom min-h-0 min-w-0 flex-1 overflow-y-auto p-3", !mobile && "md:max-w-4xl")}>
            <h2 className="mb-4 flex items-center gap-3 text-3xl font-medium tracking-tight">
              {mobile && <RoundButton label={t("settings.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
              {parent ? `${parent.title} / ${section.title}` : section.title}
            </h2>
            <SettingsOutlet />
          </div>
        )}
      </div>
    </Shell>
  )
}
