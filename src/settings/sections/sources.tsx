import { ArrowDown, ArrowUp } from "lucide-react"
import { useState } from "react"
import { Pill, RoundButton, ConfirmButton, Field, Row, SectionCard, Segmented, Swatches, ToggleRow } from "../controls"
import { retestPlex } from "@/lib/plex"
import { connKind, type ConnMode } from "@/lib/plex-pure"
import { explain } from "@/lib/net"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { SOURCE_SWATCHES, withMeta } from "@/lib/sources"

/** Plex only: which address is in use, which addresses are allowed, and a re-test (also re-picks after moving between home and away). */
function PlexConnection({ id }: { id: string }) {
  const t = useT()
  const s = useApp((st) => st.sources.find((x) => x.id === id))!
  const updateSource = useApp((st) => st.updateSource)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const mode = s.connMode ?? "auto"
  const retest = async () => {
    setBusy(true); setMsg("")
    try { setMsg(t("settings.sources.connected", { kind: t(`settings.sources.kind.${await retestPlex(s)}`) })) } catch (e) { setMsg(explain(e)) }
    setBusy(false)
  }
  return (
    <>
      <Row label={t("settings.sources.connection")} description={t("settings.sources.inUse", { kind: t(`settings.sources.kind.${connKind(s.conns, s.server)}`), server: (s.server ?? "").replace(/^https?:\/\//, "") })} stack>
        <Segmented<ConnMode> label={t("settings.sources.connMode")} value={mode} onChange={(v) => updateSource(s.id, { connMode: v })}
          options={(["auto", "norelay", "local"] as const).map((v) => ({ value: v, label: t(`settings.sources.mode.${v}`) }))} />
      </Row>
      <p className="text-sm text-muted-foreground">{t(`settings.sources.mode.${mode}.desc`)}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Pill disabled={busy} onClick={() => void retest()}>{busy ? t("settings.sources.testing") : t("settings.sources.retest")}</Pill>
        {msg && <span role="status" className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </>
  )
}

export default function SourcesSection() {
  const t = useT()
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
        const status = !s.enabled ? t("settings.sources.disabled") : st?.status === "ready" ? fmt.plural("settings.sources.items", st.count) : st?.status === "loading" ? st.msg || t("settings.sources.loading") : st?.status === "error" ? t("settings.sources.failed") : t("settings.sources.notLoaded")
        return (
          <SectionCard key={s.id} title={<span className="flex items-center gap-3"><span aria-hidden style={{ background: s.color }} className="size-4 shrink-0 rounded-full" /><bdi>{s.name}</bdi></span>} description={`${s.type === "plex" ? "Plex" : s.type === "jellyfin" ? "Jellyfin" : s.type === "m3u" ? "M3U" : "Xtream"} - ${status}`}>
            {st?.status === "error" && s.enabled && <p role="alert" className="text-sm text-destructive">{st.msg}</p>}
            {s.type === "plex" && <PlexConnection id={s.id} />}
            <Field label={t("settings.sources.name")} value={s.name} onChange={(v) => v.trim() && updateSource(s.id, { name: v })} error={s.name.trim() ? undefined : t("settings.sources.nameEmpty")} />
            <Row label={t("settings.sources.color")} stack><Swatches label={t("settings.sources.color")} value={s.color} colors={SOURCE_SWATCHES} onChange={(c) => updateSource(s.id, { color: c })} /></Row>
            <ToggleRow label={t("settings.sources.enabled")} description={t("settings.sources.enabled.desc")} checked={s.enabled} onChange={(v) => updateSource(s.id, { enabled: v })} />
            <Row label={t("settings.sources.priority")} description={t("settings.sources.priority.desc")}>
              <RoundButton label={t("settings.sources.moveUp")} aria-disabled={i === 0} className={i === 0 ? "opacity-50" : ""} onClick={() => i > 0 && moveSource(s.id, -1)}><ArrowUp /></RoundButton>
              <RoundButton label={t("settings.sources.moveDown")} aria-disabled={i === sources.length - 1} className={i === sources.length - 1 ? "opacity-50" : ""} onClick={() => i < sources.length - 1 && moveSource(s.id, 1)}><ArrowDown /></RoundButton>
            </Row>
            <div className="flex flex-wrap gap-2">
              <Pill disabled={!s.enabled || st?.status === "loading"} onClick={() => void useCatalog.getState().retry(s.id)}>{t("settings.sources.refresh")}</Pill>
              <ConfirmButton confirmLabel={t("settings.sources.removeConfirm")} onConfirm={() => { useCatalog.getState().forget(s.id); removeSource(s.id); if (sources.length === 1) reset("sources") }}>{t("settings.sources.remove")}</ConfirmButton>
            </div>
          </SectionCard>
        )
      })}
      <SectionCard>
        <Row label={t("settings.sources.add")} description={t("settings.sources.add.desc")}><Pill variant="primary" onClick={() => go("sources")}>{t("settings.sources.add")}</Pill></Row>
        <ToggleRow label={t("settings.sources.badges")} description={t("settings.sources.badges.desc")} checked={badges} onChange={(v) => setSettings({ sourceBadges: v })} />
      </SectionCard>
    </div>
  )
}
