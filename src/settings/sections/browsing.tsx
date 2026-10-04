import { ChevronDown, ChevronUp } from "lucide-react"
import { Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { HOME_ROWS } from "@/layouts/home-data"
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

export default function BrowsingSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <Row label={t("settings.startPage")} description={t("settings.startPage.desc")} stack>
          <Segmented label={t("settings.startPage")} value={settings.startPage ?? "home"} options={(["home", "live", "movies", "series", "library"] as const).map((v) => ({ value: v, label: t(`settings.startPage.${v}`) }))} onChange={(v) => setSettings({ startPage: v })} />
        </Row>
        <Row label={t("settings.catnav")} description={t("settings.catnav.desc")} stack>
          <Segmented label={t("settings.catnav")} value={settings.catNav ?? "bar"} options={[{ value: "bar", label: t("settings.catnav.bar") }, { value: "sidebar", label: t("settings.catnav.sidebar") }]} onChange={(v) => setSettings({ catNav: v })} />
        </Row>
        <Row label={t("settings.cardSize")} description={t("settings.cardSize.desc")} stack>
          <Segmented label={t("settings.cardSize")} value={settings.cardSize ?? "normal"} options={[{ value: "small", label: t("settings.cardSize.small") }, { value: "normal", label: t("settings.cardSize.normal") }, { value: "large", label: t("settings.cardSize.large") }, { value: "xl", label: t("settings.cardSize.xl") }]} onChange={(v) => setSettings({ cardSize: v })} />
        </Row>
        <Row label={t("settings.cardInfo")} description={t("settings.cardInfo.desc")} stack>
          <Segmented label={t("settings.cardInfo")} value={settings.cardInfo ?? "show"} options={[{ value: "show", label: t("settings.cardInfo.show") }, { value: "hide", label: t("settings.cardInfo.hide") }]} onChange={(v) => setSettings({ cardInfo: v })} />
        </Row>
        <ToggleRow label={t("settings.display.badges")} description={t("settings.display.badges.desc")} checked={settings.sourceBadges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
      <HomeRows />
    </div>
  )
}
