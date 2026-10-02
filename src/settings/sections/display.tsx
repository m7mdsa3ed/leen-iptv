import { ChevronDown, ChevronUp } from "lucide-react"
import { Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { HOME_ROWS } from "@/layouts/home-data"
import { LAYOUTS_META } from "@/lib/layouts"
import { getOverride, setOverride, useMode, type Override } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

/** Home rows: move up / down and show / hide. Stored as an order list (missing rows go last) plus a hidden list. */
function HomeRows() {
  const t = useT()
  const { settings, setSettings } = useApp()
  const order = [...(settings.homeOrder ?? []).filter((k) => HOME_ROWS.includes(k as never)), ...HOME_ROWS.filter((k) => !(settings.homeOrder ?? []).includes(k))]
  const hide = settings.homeHide ?? []
  const move = (i: number, d: number) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; setSettings({ homeOrder: o }) }
  return (
    <SectionCard title={t("settings.homeRows")} description={t("settings.homeRows.desc")}>
      {order.map((k, i) => (
        <div key={k} className="flex items-center gap-2">
          <div className="min-w-0 flex-1"><ToggleRow label={t(`settings.homeRows.${k}`)} checked={!hide.includes(k)} onChange={(v) => setSettings({ homeHide: v ? hide.filter((x) => x !== k) : [...hide, k], homeOrder: order })} /></div>
          <Pill aria-label={t("settings.homeRows.up")} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp /></Pill>
          <Pill aria-label={t("settings.homeRows.down")} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ChevronDown /></Pill>
        </div>
      ))}
      <Pill onClick={() => setSettings({ homeOrder: [], homeHide: [] })}>{t("settings.homeRows.reset")}</Pill>
    </SectionCard>
  )
}

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
        <Row label={t("settings.cardSize")} description={t("settings.cardSize.desc")} stack>
          <Segmented label={t("settings.cardSize")} value={settings.cardSize ?? "normal"} options={[{ value: "small", label: t("settings.cardSize.small") }, { value: "normal", label: t("settings.cardSize.normal") }, { value: "large", label: t("settings.cardSize.large") }, { value: "xl", label: t("settings.cardSize.xl") }]} onChange={(v) => setSettings({ cardSize: v })} />
        </Row>
        <Row label={t("settings.cardInfo")} description={t("settings.cardInfo.desc")} stack>
          <Segmented label={t("settings.cardInfo")} value={settings.cardInfo ?? "show"} options={[{ value: "show", label: t("settings.cardInfo.show") }, { value: "hide", label: t("settings.cardInfo.hide") }]} onChange={(v) => setSettings({ cardInfo: v })} />
        </Row>
        <Row label={t("settings.startPage")} description={t("settings.startPage.desc")} stack>
          <Segmented label={t("settings.startPage")} value={settings.startPage ?? "home"} options={(["home", "live", "movies", "series", "library"] as const).map((v) => ({ value: v, label: t(`settings.startPage.${v}`) }))} onChange={(v) => setSettings({ startPage: v })} />
        </Row>
        <Row label={t("settings.catnav")} description={t("settings.catnav.desc")} stack>
          <Segmented label={t("settings.catnav")} value={settings.catNav ?? "bar"} options={[{ value: "bar", label: t("settings.catnav.bar") }, { value: "sidebar", label: t("settings.catnav.sidebar") }]} onChange={(v) => setSettings({ catNav: v })} />
        </Row>
        <Row label={t("settings.keyboard")} description={t("settings.keyboard.desc")} stack>
          <Segmented label={t("settings.keyboard")} value={settings.keyboard ?? "auto"} options={[{ value: "auto", label: t("settings.keyboard.auto") }, { value: "on", label: t("settings.keyboard.on") }, { value: "off", label: t("settings.keyboard.off") }]} onChange={(v) => setSettings({ keyboard: v })} />
        </Row>
        <ToggleRow label={t("settings.display.badges")} description={t("settings.display.badges.desc")} checked={settings.sourceBadges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
      <HomeRows />
    </div>
  )
}
