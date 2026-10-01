import { useEffect, useState } from "react"
import { useHistory } from "@/lib/history"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { Toggle } from "@/components/gtv/toggle"
import { LAYOUTS_META } from "@/lib/layouts"
import { normalizeCfg } from "@/lib/meta"
import { PROVIDERS } from "@/lib/meta/providers"
import type { ProviderCfg } from "@/lib/meta/types"
import { cn } from "@/lib/utils"
import { Shell, TvButton, askPin } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { getOverride, isTv, setOverride, useMode, type Override } from "@/lib/device"
import { useApp, useProfile } from "@/lib/store"

const Sec = ({ children }: { children: React.ReactNode }) => (
  <section className="flex flex-wrap items-center gap-3 rounded-[28px] bg-surface p-5 md:p-6">{children}</section>
)
/** Watch history + stats controls (data stays on this device, per profile). */
function HistorySettings() {
  const { settings, setSettings, profileId } = useApp()
  const go = useRoute((s) => s.go)
  const sessions = useHistory((s) => s.sessions)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { if (profileId) void useHistory.getState().load(profileId) }, [profileId])
  const exportJson = () => {
    const { sessions, days } = useHistory.getState()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions, days }, null, 2)], { type: "application/json" }))
    a.download = "leen-iptv-history.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-5 md:p-6">
        <Toggle label="Track watch history" description="Remembers what you watch, for how long and how the stream performed. Stored only on this device, per profile." checked={settings.trackHistory} onChange={(v) => setSettings({ trackHistory: v })} />
        <div className="text-sm text-muted-foreground">{sessions.length} sessions saved for this profile.</div>
      </section>
      <section className="flex flex-wrap gap-3 rounded-[28px] bg-surface p-5 md:p-6">
        <Pill variant="primary" onClick={() => go("history")}>View history</Pill>
        <Pill onClick={() => go("stats")}>View stats</Pill>
        <Pill onClick={exportJson} disabled={!sessions.length}>Export JSON</Pill>
        <Pill variant={confirm ? "primary" : "ghost"} disabled={!sessions.length} onBlur={() => setConfirm(false)} onClick={() => (confirm ? (useHistory.getState().clear(), setConfirm(false)) : setConfirm(true))}>
          {confirm ? "Press again to clear all" : "Clear history and stats"}
        </Pill>
      </section>
    </div>
  )
}

const TABS = ["Sources", "Profile & PIN", "Display", "Metadata", "History", "Network"] as const

/** Movie/series info providers, tried top to bottom (first non-empty value per field wins; ratings from all are kept). */
function MetaSettings() {
  const { settings, setSettings } = useApp()
  const cfgs = normalizeCfg(settings.meta)
  const save = (next: ProviderCfg[]) => setSettings({ meta: next })
  const patch = (id: string, p: Partial<ProviderCfg>) => save(cfgs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const move = (i: number, d: number) => {
    const n = [...cfgs]
    const j = i + d
    if (j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j], n[i]]
    save(n)
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Details, cast, ratings and similar titles for movies and series. Providers are tried top to bottom and the first one with a value wins; ratings from all are shown. Similar titles only appear when they are in your catalog. Results are cached for a week.</p>
      {cfgs.map((c, i) => {
        const p = PROVIDERS.find((x) => x.id === c.id)!
        return (
          <section key={c.id} className="flex flex-col gap-3 rounded-[28px] bg-surface p-5 md:p-6">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1 text-xl font-medium">{i + 1}. {p.name}</div>
              <RoundButton label="Move up" onClick={() => move(i, -1)}><ChevronUp /></RoundButton>
              <RoundButton label="Move down" onClick={() => move(i, 1)}><ChevronDown /></RoundButton>
              <Toggle checked={c.enabled} label={`Use ${p.name}`} onChange={(v) => patch(c.id, { enabled: v })} className="w-auto [&>span:first-child]:sr-only" />
            </div>
            {p.needsKey && <Input data-nav className="h-12 w-full max-w-[32rem] rounded-2xl text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" type="password" autoComplete="off" spellCheck={false} placeholder="API key" value={c.key ?? ""} onChange={(e) => patch(c.id, { key: e.target.value.trim() })} />}
            {p.hasLang && <Input data-nav className="h-12 w-full max-w-[20rem] rounded-2xl text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" autoComplete="off" spellCheck={false} placeholder="Language, e.g. en-US or ar-SA" value={c.lang ?? ""} onChange={(e) => patch(c.id, { lang: e.target.value.trim() })} />}
            {p.hint && <div className="text-sm text-muted-foreground">{p.hint}</div>}
            {c.id === "xtream" && <div className="text-sm text-muted-foreground">What your panel already provides (plot, genre, cast names, rating, and TMDB/IMDb ids that make the other providers exact).</div>}
          </section>
        )
      })}
    </div>
  )
}

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
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:max-w-4xl">
        {tab === "Sources" && <Sec>
          {sources.map((s) => (
            <div key={s.id} className="flex max-w-full flex-wrap items-center gap-2 rounded-full bg-surface-2 p-2 pl-5">
              <span className="text-lg">{s.name} <span className="text-sm text-muted-foreground">{s.type === "plex" ? "Plex" : s.type}</span></span>
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
            </>
          )}
          <div className="w-full text-lg">Layout</div>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {LAYOUTS_META.map((l) => (
              <Pill key={l.id} variant={settings.layout === l.id ? "primary" : "tonal"} aria-pressed={settings.layout === l.id} className="h-auto flex-col items-start gap-0.5 rounded-[24px] py-3 text-left whitespace-normal" onClick={() => setSettings({ layout: l.id })}>
                <span>{l.name}</span>
                <span className="text-sm font-normal opacity-70">{l.description}</span>
              </Pill>
            ))}
          </div>
          <div className="w-full text-lg">Motion</div>
          {([["full", "Full"], ["reduced", "Reduced"], ["off", "Off"]] as const).map(([v, label]) => (
            <TvButton key={v} variant={settings.motion === v ? "default" : "secondary"} onClick={() => setSettings({ motion: v })}>{label}</TvButton>
          ))}
          <div className="w-full text-muted-foreground">Full animates screens and focus. Reduced only fades and scales focus. Off disables all animation, which helps older TVs.</div>
          <div className="w-full text-lg">Screen mode</div>
          {(["auto", "tv", "desktop", "mobile"] as Override[]).map((o) => (
            <TvButton key={o} variant={getOverride() === o ? "default" : "secondary"} className="capitalize" onClick={() => getOverride() !== o && setOverride(o)}>{o === "tv" ? "TV" : o}</TvButton>
          ))}
          <div className="w-full text-muted-foreground">Screen mode: {mode}{getOverride() === "auto" ? " (auto-detected)" : " (manual)"}. Changing it reloads the app. Add ?tv=1 to the URL to force TV layout.</div>
        </Sec>}
        {tab === "Metadata" && <MetaSettings />}
        {tab === "History" && <HistorySettings />}
        {tab === "Network" && <Sec>
          <Input data-nav className="h-12 w-full rounded-2xl max-w-[32rem] text-base focus-visible:ring-0 md:text-lg [html[data-mode=mobile]_&]:text-[16px]" type="url" inputMode="url" autoComplete="off" spellCheck={false} placeholder="CORS proxy: http://host:8787 or https://proxy.corsfix.com/?" value={settings.proxy} onChange={(e) => setSettings({ proxy: e.target.value.trim() })} />
          <Toggle label="Proxy streams too" description="Also send video through the proxy (slower, fixes blocked streams)." checked={settings.proxyStreams} onChange={(v) => setSettings({ proxyStreams: v })} />
          <TvButton variant="secondary" onClick={() => setSettings({ liveExt: settings.liveExt === "m3u8" ? "ts" : "m3u8" })}>Xtream live format: {settings.liveExt}</TvButton>
        </Sec>}
        </div>
      </div>
    </Shell>
  )
}
