import { useEffect, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { Shell } from "@/components/tv/ui"
import { useApp } from "@/lib/store"
import { useProfile } from "@/lib/store"
import { useSync } from "@/lib/sync"
import { SECTIONS, useSettingsNav, type SectionKey } from "@/settings/sections"
import "../settings.css"

const GROUPS: SectionKey[][] = [["account", "profiles", "sources"], ["display", "playback", "metadata"], ["history", "network", "about"]]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Apple TV Settings (tvOS): grouped inset rows push a sub-screen; Back returns to the list, then exits. */
export default function SettingsPage() {
  const { open, select, close } = useSettingsNav()
  const p = useProfile()
  const { sources, settings } = useApp()
  const email = useSync().session?.email
  const root = useRef<HTMLDivElement>(null)
  const last = useRef<SectionKey | null>(null)
  const value: Partial<Record<SectionKey, string>> = {
    account: email ?? "Off", profiles: p?.name, sources: String(sources.length), display: cap(settings.theme), playback: settings.liveExt.toUpperCase(),
    network: settings.proxy ? "Proxy" : "Direct", history: settings.trackHistory ? "On" : "Off",
  }

  // hardware Back: sub-screen -> list (capture so the app-level handler does not also run)
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if ((e.keyCode === 461 || e.keyCode === 27 || e.keyCode === 8) && !(e.target instanceof HTMLInputElement) && !document.querySelector("[data-modal]")) {
        e.preventDefault(); e.stopImmediatePropagation(); close()
      }
    }
    document.addEventListener("keydown", h, true)
    return () => document.removeEventListener("keydown", h, true)
  }, [open, close])

  // focus: into the sub-screen's Back button, or back onto the row that was opened
  useEffect(() => {
    if (open) last.current = open
    const el = open ? root.current?.querySelector<HTMLElement>("[data-atv-back]") : last.current ? root.current?.querySelector<HTMLElement>(`[data-sec=${last.current}]`) : null
    el?.focus({ preventScroll: true })
  }, [open])

  const sec = SECTIONS.find((s) => s.key === open)
  return (
    <Shell page="settings" title="Settings">
      <div ref={root} className="atv-set h-full overflow-y-auto">
        <div className="atv-set-col">
          {sec ? (
            <>
              <div className="atv-set-head">
                <RoundButton label="Back" data-atv-back="" onClick={close}><ChevronLeft /></RoundButton>
                <h1 className="atv-h1">{sec.title}</h1>
              </div>
              <p className="atv-set-sub">{sec.description}</p>
              <div className="atv-set-body"><sec.Component /></div>
            </>
          ) : (
            <>
              <h1 className="atv-h1 atv-set-title">Settings</h1>
              <nav data-nav-group="memory" aria-label="Settings" className="flex flex-col gap-8">
                {GROUPS.map((g, i) => (
                  <div key={i} className="atv-set-group">
                    {g.map((k) => {
                      const s = SECTIONS.find((x) => x.key === k)!
                      return (
                        <button key={k} data-nav data-pill data-sec={k} onClick={() => select(k)} className="atv-set-row">
                          <s.icon className="atv-set-ico" />
                          <span className="min-w-0 flex-1 truncate text-left">{s.title}</span>
                          {value[k] && <span className="atv-set-val truncate">{value[k]}</span>}
                          <ChevronRight className="atv-set-chev" />
                        </button>
                      )
                    })}
                  </div>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}
