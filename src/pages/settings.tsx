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
  const { groups, open, key, section, select, close, parent } = useSettingsNav()
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
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <h3 className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
          {group.sections.map((s) => {
            const on = !mobile && s.key === key
            return (
              <div key={s.key} className="flex flex-col gap-1">
                <Pill variant={on ? "primary" : "ghost"} data-nav-home={on ? "" : undefined} className="h-14 justify-start gap-4 px-5 text-lg" onClick={() => select(s.key)}>
                  <s.icon />{s.title}
                </Pill>
                {s.children?.map((child) => {
                  const childOn = !mobile && child.key === key
                  return <Pill key={child.key} variant={childOn ? "tonal" : "ghost"} data-nav-home={childOn ? "" : undefined} className="ms-8 h-11 justify-start gap-3 px-4 text-base" onClick={() => select(child.key)}><child.icon className="size-4" />{child.title}</Pill>
                })}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )
  const body = (
    <div className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:max-w-4xl")}>
      <h2 className="mb-4 flex items-center gap-3 text-3xl font-medium tracking-tight">
        {mobile && <RoundButton label={t("settings.back")} onClick={close}><ChevronLeft className="rtl-flip" /></RoundButton>}
        {parent ? `${parent.title} / ${section.title}` : section.title}
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
