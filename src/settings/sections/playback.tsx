import { Field, Pill, Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { ORIENTS, usePrefs, setPrefs } from "@/player/prefs"
import { canLockOrient } from "@/player/util"
import { isTv, useTouch } from "@/lib/device"
import { useApp } from "@/lib/store"

export default function PlaybackSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const go = useRoute((s) => s.go)
  const player = usePrefs() // the clock, fullscreen and rotation are player preferences of this device, not synced settings
  const touch = useTouch() && !isTv
  const bad = settings.proxy && !/^https?:\/\//.test(settings.proxy)
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t("settings.playback.title")}>
        <Row label={t("settings.playback.liveFormat")} description={t("settings.playback.liveFormat.desc")} stack>
          <Segmented label={t("settings.playback.liveFormat")} value={settings.liveExt} options={[{ value: "m3u8", label: "m3u8" }, { value: "ts", label: "ts" }]} onChange={(v) => setSettings({ liveExt: v })} />
        </Row>
        <ToggleRow label={t("settings.playback.clock")} description={t("settings.playback.clock.desc")} checked={player.clock} onChange={(v) => setPrefs({ clock: v })} />
        {touch && <ToggleRow label={t("settings.playback.fsOnPlay")} description={t("settings.playback.fsOnPlay.desc")} checked={player.fsOnPlay} onChange={(v) => setPrefs({ fsOnPlay: v })} />}
        {touch && canLockOrient() && (
          <Row label={t("player.orient.title")} description={t("settings.playback.orient.desc")} stack>
            <Segmented label={t("player.orient.title")} value={player.orient} options={ORIENTS.map((o) => ({ value: o, label: t(`player.orient.${o}`) }))} onChange={(v) => setPrefs({ orient: v })} />
          </Row>
        )}
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
