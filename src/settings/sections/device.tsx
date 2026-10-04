import { Row, SectionCard, Segmented } from "../controls"
import { getOverride, setOverride, useMode, type Override } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

export default function DeviceSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const mode = useMode()
  const ov = getOverride()
  return (
    <SectionCard>
      <Row label={t("settings.display.mode")} description={t("settings.display.mode.desc", { mode: t(`settings.mode.${mode}`), how: t(ov === "auto" ? "settings.display.mode.auto" : "settings.display.mode.manual") })} stack>
        <Segmented<Override> label={t("settings.display.mode")} value={ov} options={(["auto", "tv", "desktop", "mobile"] as const).map((v) => ({ value: v, label: t(`settings.mode.${v}`) }))} onChange={setOverride} />
      </Row>
      <Row label={t("settings.keyboard")} description={t("settings.keyboard.desc")} stack>
        <Segmented label={t("settings.keyboard")} value={settings.keyboard ?? "auto"} options={[{ value: "auto", label: t("settings.keyboard.auto") }, { value: "on", label: t("settings.keyboard.on") }, { value: "off", label: t("settings.keyboard.off") }]} onChange={(v) => setSettings({ keyboard: v })} />
      </Row>
    </SectionCard>
  )
}
