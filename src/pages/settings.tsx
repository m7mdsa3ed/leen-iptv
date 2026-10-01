import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Pill } from "@/components/gtv"
import { cn } from "@/lib/utils"
import { Shell, TvButton, askPin } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { getOverride, isTv, setOverride, useMode, type Override } from "@/lib/device"
import { useApp, useProfile } from "@/lib/store"

const Sec = ({ children }: { children: React.ReactNode }) => (
  <section className="flex flex-wrap items-center gap-3 rounded-[28px] bg-surface p-5 md:p-6">{children}</section>
)
const TABS = ["Sources", "Profile & PIN", "Display", "Network"] as const

export default function SettingsPage() {
  const { sources, sourceId, settings, setSettings, setSource, removeSource, updateProfile, removeProfile, profiles } = useApp()
  const p = useProfile()!
  const mode = useMode()
  const go = useRoute((s) => s.go)
  const reset = useRoute((s) => s.reset)
  const [pin, setPin] = useState("")
  const [tab, setTab] = useState<(typeof TABS)[number]>("Sources")
  const load = (id: string, force = false) => { const s = useApp.getState().sources.find((x) => x.id === id); if (s) { setSource(id); void useCatalog.getState().load(s, settings.proxy, force) } }

  return (
    <Shell page="settings" title="Settings">
      <div className="flex h-full min-h-0 flex-col gap-4 md:flex-row md:gap-8">
        <nav className="flex shrink-0 gap-2 overflow-x-auto p-1 md:w-64 md:flex-col md:overflow-visible">
          {TABS.map((t) => (
            <Pill key={t} variant={tab === t ? "tonal" : "ghost"} className={cn("md:justify-start", tab === t && "bg-surface-3")} onClick={() => setTab(t)}>{t}</Pill>
          ))}
        </nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-1 md:max-w-4xl md:p-2">
        {tab === "Sources" && <Sec>
          {sources.map((s) => (
            <div key={s.id} className="flex max-w-full flex-wrap items-center gap-2 rounded-full bg-surface-2 p-2 pl-5">
              <span className="text-lg">{s.name} <span className="text-sm text-muted-foreground">{s.type}</span></span>
              <TvButton variant={s.id === sourceId ? "default" : "secondary"} onClick={() => load(s.id)}>{s.id === sourceId ? "Active" : "Use"}</TvButton>
              <TvButton variant="secondary" onClick={() => load(s.id, true)}>Refresh</TvButton>
              <TvButton variant="destructive" onClick={() => { useCatalog.getState().forget(s.id); removeSource(s.id); if (sources.length === 1) reset("sources") }}>Remove</TvButton>
            </div>
          ))}
          <TvButton onClick={() => go("sources")}>Add source</TvButton>
        </Sec>}
        {tab === "Profile & PIN" && <Sec>
          <h2 className="w-full text-xl font-medium">Profile: {p.name}</h2>
          <Input data-nav className="h-12 w-full rounded-2xl max-w-72 text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" inputMode="numeric" maxLength={4} placeholder={p.pin ? "New PIN (4 digits)" : "Set PIN (4 digits)"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          <TvButton disabled={pin.length !== 4} onClick={async () => { if (p.pin && !(await askPin(p.pin))) return; updateProfile(p.id, { pin }); setPin("") }}>Save PIN</TvButton>
          {p.pin && <TvButton variant="secondary" onClick={async () => (await askPin(p.pin!)) && updateProfile(p.id, { pin: undefined, locked: [] })}>Remove PIN</TvButton>}
          <TvButton variant="secondary" onClick={() => reset("profiles")}>Switch profile</TvButton>
          {profiles.length > 1 && <TvButton variant="destructive" onClick={async () => { if (p.pin && !(await askPin(p.pin))) return; removeProfile(p.id); reset("profiles") }}>Delete profile</TvButton>}
          <div className="w-full text-muted-foreground">{isTv ? "With a PIN set, press Yellow on a category in Live/Movies/Series to lock it." : "With a PIN set, right-click (or long-press) a category in Live/Movies/Series to lock it."}</div>
        </Sec>}
        {tab === "Display" && <Sec>
          <div className="w-full text-lg">Theme</div>
          {([["system", "System"], ["dark", "Dark"], ["light", "Light"]] as const).map(([v, label]) => (
            <TvButton key={v} variant={settings.theme === v ? "default" : "secondary"} onClick={() => setSettings({ theme: v })}>{label}</TvButton>
          ))}
          <div className="w-full text-muted-foreground">System follows your device (always dark on TV).</div>
          {mode === "tv" && (
            <>
              <div className="w-full text-lg">TV size</div>
              {([[0.8, "Small"], [1, "Normal"], [1.2, "Large"], [1.4, "Extra large"]] as const).map(([v, label]) => (
                <TvButton key={v} variant={settings.tvScale === v ? "default" : "secondary"} onClick={() => setSettings({ tvScale: v })}>{label} {Math.round(v * 100)}%</TvButton>
              ))}
              <div className="w-full text-lg">Layout</div>
            </>
          )}
          {(["auto", "tv", "desktop", "mobile"] as Override[]).map((o) => (
            <TvButton key={o} variant={getOverride() === o ? "default" : "secondary"} className="capitalize" onClick={() => getOverride() !== o && setOverride(o)}>{o === "tv" ? "TV" : o}</TvButton>
          ))}
          <div className="w-full text-muted-foreground">Layout: {mode}{getOverride() === "auto" ? " (auto-detected)" : " (manual)"}. Changing it reloads the app. Add ?tv=1 to the URL to force TV layout.</div>
        </Sec>}
        {tab === "Network" && <Sec>
          <Input data-nav className="h-12 w-full rounded-2xl max-w-[32rem] text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="CORS proxy: http://host:8787 or https://proxy.corsfix.com/?" value={settings.proxy} onChange={(e) => setSettings({ proxy: e.target.value.trim() })} />
          <label className="flex min-h-11 items-center gap-3 text-lg"><Switch data-nav className="after:-inset-y-3.5" checked={settings.proxyStreams} onCheckedChange={(v) => setSettings({ proxyStreams: v })} /> Proxy streams too</label>
          <TvButton variant="secondary" onClick={() => setSettings({ liveExt: settings.liveExt === "m3u8" ? "ts" : "m3u8" })}>Xtream live format: {settings.liveExt}</TvButton>
        </Sec>}
        </div>
      </div>
    </Shell>
  )
}
