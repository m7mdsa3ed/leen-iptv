import { Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { LAYOUTS_META } from "@/lib/layouts"
import { getOverride, setOverride, useMode, type Override } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

export default function DisplaySection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const mode = useMode()
  const layout = LAYOUTS_META.find((l) => l.id === settings.layout)
  const ov = getOverride()
  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <Row label={t("settings.language")} description={t("settings.language.desc")} stack>
          <Segmented label={t("settings.language")} value={settings.language} options={[{ value: "auto", label: t("settings.language.auto") }, { value: "en", label: "English" }, { value: "ar", label: "العربية (مصر)" }]} onChange={(v) => setSettings({ language: v })} />
        </Row>
        <Row label={t("settings.display.layout")} description={layout ? t(layout.descKey) : undefined} stack>
          <Segmented label={t("settings.display.layout")} value={settings.layout} options={LAYOUTS_META.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => setSettings({ layout: v })} />
        </Row>
        <Row label={t("settings.display.theme")} description={t("settings.display.theme.desc")} stack>
          <Segmented label={t("settings.display.theme")} value={settings.theme} options={[{ value: "system", label: t("settings.display.theme.system") }, { value: "dark", label: t("settings.display.theme.dark") }, { value: "light", label: t("settings.display.theme.light") }]} onChange={(v) => setSettings({ theme: v })} />
        </Row>
        <Row label={t("settings.display.motion")} description={t("settings.display.motion.desc")} stack>
          <Segmented label={t("settings.display.motion")} value={settings.motion} options={[{ value: "full", label: t("settings.display.motion.full") }, { value: "reduced", label: t("settings.display.motion.reduced") }, { value: "off", label: t("settings.display.motion.off") }]} onChange={(v) => setSettings({ motion: v })} />
        </Row>
        {mode === "tv" && (
          <Row label={t("settings.display.tvSize")} stack>
            <Segmented label={t("settings.display.tvSize")} value={settings.tvScale} options={[{ value: 0.8, label: t("settings.display.tvSize.small") }, { value: 1, label: t("settings.display.tvSize.normal") }, { value: 1.2, label: t("settings.display.tvSize.large") }, { value: 1.4, label: t("settings.display.tvSize.xl") }]} onChange={(v) => setSettings({ tvScale: v })} />
          </Row>
        )}
        <Row label={t("settings.display.mode")} description={t("settings.display.mode.desc", { mode: t(`settings.mode.${mode}`), how: t(ov === "auto" ? "settings.display.mode.auto" : "settings.display.mode.manual") })} stack>
          <Segmented<Override> label={t("settings.display.mode")} value={ov} options={(["auto", "tv", "desktop", "mobile"] as const).map((v) => ({ value: v, label: t(`settings.mode.${v}`) }))} onChange={setOverride} />
        </Row>
        <ToggleRow label={t("settings.display.badges")} description={t("settings.display.badges.desc")} checked={settings.sourceBadges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
    </div>
  )
}
