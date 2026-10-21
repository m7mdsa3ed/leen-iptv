import { Field, Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"

export default function PlaybackSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const go = useRoute((s) => s.go)
  const bad = settings.proxy && !/^https?:\/\//.test(settings.proxy)
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t("settings.playback.title")}>
        <Row label={t("settings.playback.liveFormat")} description={t("settings.playback.liveFormat.desc")} stack>
          <Segmented label={t("settings.playback.liveFormat")} value={settings.liveExt} options={[{ value: "m3u8", label: "m3u8" }, { value: "ts", label: "ts" }]} onChange={(v) => setSettings({ liveExt: v })} />
        </Row>
        <ToggleRow label={t("settings.playback.nextBanner")} description={t("settings.playback.nextBanner.desc")} checked={settings.nextBanner ?? true} onChange={(v) => setSettings({ nextBanner: v })} />
        <ToggleRow label={t("settings.playback.autoNext")} description={t("settings.playback.autoNext.desc")} checked={settings.autoNext ?? true} onChange={(v) => setSettings({ autoNext: v })} />
        <ToggleRow label={t("settings.playback.track")} description={t("settings.playback.track.desc")} checked={settings.trackHistory} onChange={(v) => setSettings({ trackHistory: v })} />
      </SectionCard>
      {/* was its own Network section: the proxy settings sit together here */}
      <SectionCard title={t("settings.network.title")} description={t("settings.network.desc")}>
        <Field label={t("settings.network.url")} type="url" dir="ltr" inputMode="url" placeholder={t("settings.network.urlPh")} value={settings.proxy} onChange={(v) => setSettings({ proxy: v.trim() })} error={bad ? t("settings.network.urlBad") : undefined} />
        <ToggleRow label={t("settings.playback.proxyStreams")} description={t("settings.playback.proxyStreams.desc")} checked={settings.proxyStreams} onChange={(v) => setSettings({ proxyStreams: v })} />
        <Row label={t("diag.title")} description={t("diag.entry.desc")}><Pill onClick={() => go("diagnostics")}>{t("diag.entry")}</Pill></Row>
      </SectionCard>
    </div>
  )
}
