import { Check } from "lucide-react"
import { Row, SectionCard, Segmented } from "../controls"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { swatches, THEMES } from "@/lib/themes"
import { useIsDark } from "@/lib/theme"

/** Colour theme picker: one D-pad focusable chip per theme with its background / surface / accent swatches. */
function ThemeChips() {
  const t = useT()
  const { settings, setSettings } = useApp()
  const dark = useIsDark()
  const cur = settings.colorTheme ?? "default"
  return (
    <div role="radiogroup" aria-label={t("settings.theme.colors")} data-nav-group className="flex flex-wrap gap-2">
      {THEMES.map((th) => {
        const on = th.id === cur
        return (
          <button key={th.id} data-nav data-pill type="button" role="radio" aria-checked={on} onClick={() => !on && setSettings({ colorTheme: th.id === "default" ? undefined : th.id })} className={"flex items-center gap-2 rounded-full ps-3 pe-4 py-2 text-base " + (on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground")}>
            <span className="flex shrink-0" dir="ltr">{swatches(th, dark).map((c, i) => <span key={i} className="-ms-1 size-5 rounded-full first:ms-0" style={{ background: c, boxShadow: "0 0 0 2px var(--surface-2)" }} />)}</span>
            <span>{t(th.nameKey)}</span>
            {on && <Check className="size-4" />}
          </button>
        )
      })}
    </div>
  )
}

export default function AppearanceSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const mode = useMode()
  return (
    <SectionCard>
      <Row label={t("settings.language")} description={t("settings.language.desc")} stack>
        <Segmented label={t("settings.language")} value={settings.language} options={[{ value: "auto", label: t("settings.language.auto") }, { value: "en", label: "English" }, { value: "ar", label: "العربية (مصر)" }]} onChange={(v) => setSettings({ language: v })} />
      </Row>
      <Row label={t("settings.display.theme")} description={t("settings.display.theme.desc")} stack>
        <Segmented label={t("settings.display.theme")} value={settings.theme} options={[{ value: "system", label: t("settings.display.theme.system") }, { value: "dark", label: t("settings.display.theme.dark") }, { value: "light", label: t("settings.display.theme.light") }]} onChange={(v) => setSettings({ theme: v })} />
      </Row>
      <Row label={t("settings.theme.colors")} description={t("settings.theme.colors.desc")} stack>
        <ThemeChips />
      </Row>
      <Row label={t("settings.display.motion")} description={t("settings.display.motion.desc")} stack>
        <Segmented label={t("settings.display.motion")} value={settings.motion} options={[{ value: "full", label: t("settings.display.motion.full") }, { value: "reduced", label: t("settings.display.motion.reduced") }, { value: "off", label: t("settings.display.motion.off") }]} onChange={(v) => setSettings({ motion: v })} />
      </Row>
      {mode === "tv" && (
        <Row label={t("settings.display.tvSize")} stack>
          <Segmented label={t("settings.display.tvSize")} value={settings.tvScale} options={[{ value: 0.8, label: t("settings.display.tvSize.small") }, { value: 1, label: t("settings.display.tvSize.normal") }, { value: 1.2, label: t("settings.display.tvSize.large") }, { value: 1.4, label: t("settings.display.tvSize.xl") }]} onChange={(v) => setSettings({ tvScale: v })} />
        </Row>
      )}
    </SectionCard>
  )
}
