import { ChevronLeft } from "lucide-react"
import { Avatar, Pill, RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useMode } from "@/lib/device"
import { useProfile } from "@/lib/store"
import { useSettingsNav } from "@/settings/sections"
import { cn } from "@/lib/utils"

/** Default Settings: two panes (section list | section content); on mobile a list that opens the section. Layouts may override. */
export default function SettingsPage() {
  const { sections, open, key, section, select, close } = useSettingsNav()
  const t = useT()
  const mobile = useMode() === "mobile"
  const p = useProfile()
  const C = section.Component
  const list = (
    <nav data-nav-group="memory" className="flex shrink-0 flex-col gap-2 p-1 md:w-72">
      {p && (
        <div className="mb-2 flex items-center gap-3 px-4 py-2">
          <Avatar name={p.name} color={p.color} className="size-12 text-xl" />
          <div dir="auto" className="min-w-0 truncate text-lg font-medium">{p.name}</div>
        </div>
      )}
      {sections.map((s) => {
        const on = !mobile && s.key === key
        return (
          <Pill key={s.key} variant={on ? "primary" : "ghost"} data-nav-home={on ? "" : undefined} className="h-14 justify-start gap-4 px-5 text-lg" onClick={() => select(s.key)}>
            <s.icon />{s.title}
          </Pill>
        )
      })}
    </nav>
  )
  const body = (
    <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:max-w-4xl")}>
      <h2 className="mb-4 flex items-center gap-3 text-3xl font-medium tracking-tight">
        {mobile && <RoundButton label={t("settings.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
        {section.title}
      </h2>
      <C />
    </div>
  )
  return (
    <Shell page="settings" title={t("settings.title")}>
      <div className="flex h-full min-h-0 gap-8">
        {mobile ? (open ? body : <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>) : <>{list}{body}</>}
      </div>
    </Shell>
  )
}
