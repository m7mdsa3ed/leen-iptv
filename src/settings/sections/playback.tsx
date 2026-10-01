import { Row, SectionCard, Segmented, ToggleRow } from "../controls"
import { useApp } from "@/lib/store"

export default function PlaybackSection() {
  const { settings, setSettings } = useApp()
  return (
    <SectionCard>
      <Row label="Xtream live format" description="m3u8 (HLS) works almost everywhere; ts is raw MPEG-TS." stack>
        <Segmented label="Xtream live format" value={settings.liveExt} options={[{ value: "m3u8", label: "m3u8" }, { value: "ts", label: "ts" }]} onChange={(v) => setSettings({ liveExt: v })} />
      </Row>
      <ToggleRow label="Proxy streams too" description="Also send video through the proxy (slower, fixes blocked streams)." checked={settings.proxyStreams} onChange={(v) => setSettings({ proxyStreams: v })} />
      <ToggleRow label="Track watch history" description="Remembers what you watch, for how long and how the stream performed. Stored only on this device, per profile." checked={settings.trackHistory} onChange={(v) => setSettings({ trackHistory: v })} />
    </SectionCard>
  )
}
