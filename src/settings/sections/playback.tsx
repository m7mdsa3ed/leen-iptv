import { Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

export default function PlaybackSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  return (
    <SectionCard>
      <Row label={t("settings.playback.liveFormat")} description={t("settings.playback.liveFormat.desc")} stack>
        <Segmented label={t("settings.playback.liveFormat")} value={settings.liveExt} options={[{ value: "m3u8", label: "m3u8" }, { value: "ts", label: "ts" }]} onChange={(v) => setSettings({ liveExt: v })} />
      </Row>
      <ToggleRow label={t("settings.playback.proxyStreams")} description={t("settings.playback.proxyStreams.desc")} checked={settings.proxyStreams} onChange={(v) => setSettings({ proxyStreams: v })} />
      <ToggleRow label={t("settings.playback.nextBanner")} description={t("settings.playback.nextBanner.desc")} checked={settings.nextBanner ?? true} onChange={(v) => setSettings({ nextBanner: v })} />
      <ToggleRow label={t("settings.playback.autoNext")} description={t("settings.playback.autoNext.desc")} checked={settings.autoNext ?? true} onChange={(v) => setSettings({ autoNext: v })} />
      <ToggleRow label={t("settings.playback.track")} description={t("settings.playback.track.desc")} checked={settings.trackHistory} onChange={(v) => setSettings({ trackHistory: v })} />
    </SectionCard>
  )
}
