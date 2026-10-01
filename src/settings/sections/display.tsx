import { Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { LAYOUTS_META } from "@/lib/layouts"
import { getOverride, setOverride, useMode, type Override } from "@/lib/device"
import { useApp } from "@/lib/store"

export default function DisplaySection() {
  const { settings, setSettings } = useApp()
  const mode = useMode()
  const layout = LAYOUTS_META.find((l) => l.id === settings.layout)
  const ov = getOverride()
  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <Row label="Layout" description={layout?.description} stack>
          <Segmented label="Layout" value={settings.layout} options={LAYOUTS_META.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setSettings({ layout: v })} />
        </Row>
        <Row label="Theme" description="System follows your device (always dark on TV)." stack>
          <Segmented label="Theme" value={settings.theme} options={[{ value: "system", label: "System" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={(v) => setSettings({ theme: v })} />
        </Row>
        <Row label="Motion" description="Full animates screens and focus. Reduced only fades and scales focus. Off disables all animation, which helps older TVs." stack>
          <Segmented label="Motion" value={settings.motion} options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "off", label: "Off" }]} onChange={(v) => setSettings({ motion: v })} />
        </Row>
        {mode === "tv" && (
          <Row label="TV size" stack>
            <Segmented label="TV size" value={settings.tvScale} options={[{ value: 0.8, label: "Small" }, { value: 1, label: "Normal" }, { value: 1.2, label: "Large" }, { value: 1.4, label: "Extra large" }]} onChange={(v) => setSettings({ tvScale: v })} />
          </Row>
        )}
        <Row label="Screen mode" description={`Now: ${mode}${ov === "auto" ? " (auto-detected)" : " (manual)"}. Changing it reloads the app. Add ?tv=1 to the URL to force TV layout.`} stack>
          <Segmented<Override> label="Screen mode" value={ov} options={[{ value: "auto", label: "Auto" }, { value: "tv", label: "TV" }, { value: "desktop", label: "Desktop" }, { value: "mobile", label: "Mobile" }]} onChange={setOverride} />
        </Row>
        <ToggleRow label="Source badges" description="Show a colored chip with the source on posters and details." checked={settings.sourceBadges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
    </div>
  )
}
