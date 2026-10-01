import { ArrowDown, ArrowUp } from "lucide-react"
import { useState } from "react"
import { Pill, RoundButton, ConfirmButton, Field, Row, SectionCard, Segmented, Swatches, ToggleRow } from "../controls"
import { retestPlex } from "@/lib/plex"
import { connKind, type ConnMode } from "@/lib/plex-pure"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { SOURCE_SWATCHES, withMeta } from "@/lib/sources"

/** Plex only: which address is in use, which addresses are allowed, and a re-test (also re-picks after moving between home and away). */
function PlexConnection({ id }: { id: string }) {
  const s = useApp((st) => st.sources.find((x) => x.id === id))!
  const updateSource = useApp((st) => st.updateSource)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const mode = s.connMode ?? "auto"
  const retest = async () => {
    setBusy(true); setMsg("")
    try { setMsg(`Connected: ${await retestPlex(s)}`) } catch (e) { setMsg(explain(e)) }
    setBusy(false)
  }
  return (
    <>
      <Row label="Connection" description={`In use: ${connKind(s.conns, s.server)} (${(s.server ?? "").replace(/^https?:\/\//, "")})`} stack>
        <Segmented<ConnMode> label="Connection mode" value={mode} onChange={(v) => updateSource(s.id, { connMode: v })}
          options={[{ value: "auto", label: "Automatic" }, { value: "norelay", label: "Never use relay" }, { value: "local", label: "Local only" }]} />
      </Row>
      <p className="text-sm text-muted-foreground">{mode === "local" ? "Only your local network is used. Away from home this source won't load." : mode === "norelay" ? "Local or direct remote access. Plex's relay is never used." : "Local first, then remote, then Plex's relay as a last resort. Switches by itself when you change networks."}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Pill disabled={busy} onClick={() => void retest()}>{busy ? "Testing..." : "Re-test connection"}</Pill>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </>
  )
}

export default function SourcesSection() {
  const sources = useApp((s) => s.sources)
  const { updateSource, moveSource, removeSource, setSettings } = useApp()
  const badges = useApp((s) => s.settings.sourceBadges)
  const stat = useCatalog((s) => s.sources)
  const go = useRoute((s) => s.go)
  const reset = useRoute((s) => s.reset)
  return (
    <div className="flex flex-col gap-4">
      {sources.map((raw, i) => {
        const s = withMeta(raw)
        const st = stat[s.id]
        const status = !s.enabled ? "Disabled" : st?.status === "ready" ? `${st.count} items` : st?.status === "loading" ? st.msg || "Loading..." : st?.status === "error" ? "Failed" : "Not loaded"
        return (
          <SectionCard key={s.id} title={<span className="flex items-center gap-3"><span aria-hidden style={{ background: s.color }} className="size-4 shrink-0 rounded-full" />{s.name}</span>} description={`${s.type === "plex" ? "Plex" : s.type === "jellyfin" ? "Jellyfin" : s.type === "m3u" ? "M3U" : "Xtream"} - ${status}`}>
            {st?.status === "error" && s.enabled && <p role="alert" className="text-sm text-destructive">{st.msg}</p>}
            {s.type === "plex" && <PlexConnection id={s.id} />}
            <Field label="Name" value={s.name} onChange={(v) => v.trim() && updateSource(s.id, { name: v })} error={s.name.trim() ? undefined : "Give the source a name."} />
            <Row label="Color" stack><Swatches label="Color" value={s.color} colors={SOURCE_SWATCHES} onChange={(c) => updateSource(s.id, { color: c })} /></Row>
            <ToggleRow label="Enabled" description="Disabled sources are not loaded or shown." checked={s.enabled} onChange={(v) => updateSource(s.id, { enabled: v })} />
            <Row label="Priority" description="When a title is in several sources, the higher one plays first.">
              <RoundButton label="Move up" aria-disabled={i === 0} className={i === 0 ? "opacity-50" : ""} onClick={() => i > 0 && moveSource(s.id, -1)}><ArrowUp /></RoundButton>
              <RoundButton label="Move down" aria-disabled={i === sources.length - 1} className={i === sources.length - 1 ? "opacity-50" : ""} onClick={() => i < sources.length - 1 && moveSource(s.id, 1)}><ArrowDown /></RoundButton>
            </Row>
            <div className="flex flex-wrap gap-2">
              <Pill disabled={!s.enabled || st?.status === "loading"} onClick={() => void useCatalog.getState().retry(s.id)}>Refresh</Pill>
              <ConfirmButton confirmLabel="Press again to remove" onConfirm={() => { useCatalog.getState().forget(s.id); removeSource(s.id); if (sources.length === 1) reset("sources") }}>Remove</ConfirmButton>
            </div>
          </SectionCard>
        )
      })}
      <SectionCard>
        <Row label="Add source" description="Xtream, M3U playlist, Plex or Jellyfin server."><Pill variant="primary" onClick={() => go("sources")}>Add source</Pill></Row>
        <ToggleRow label="Highlight sources with badges" description="Show a small colored chip with the source on posters and details." checked={badges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
    </div>
  )
}
