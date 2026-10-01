import { useEffect } from "react"
import { ConfirmButton, Pill, Row, SectionCard } from "../controls"
import { useHistory } from "@/lib/history"
import { fmt, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"

/** Watch history + stats (data stays on this device, per profile). */
export default function HistorySection() {
  const t = useT()
  const profileId = useApp((s) => s.profileId)
  const go = useRoute((s) => s.go)
  const n = useHistory((s) => s.sessions.length)
  useEffect(() => { if (profileId) void useHistory.getState().load(profileId) }, [profileId])
  const exportJson = () => {
    const { sessions, days } = useHistory.getState()
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions, days }, null, 2)], { type: "application/json" }))
    a.download = "leen-iptv-history.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <SectionCard description={fmt.plural("settings.history.saved", n)}>
      <Row label={t("settings.history.history")} description={t("settings.history.history.desc")}><Pill variant="primary" onClick={() => go("history")}>{t("settings.history.view")}</Pill></Row>
      <Row label={t("settings.history.stats")} description={t("settings.history.stats.desc")}><Pill onClick={() => go("stats")}>{t("settings.history.viewStats")}</Pill></Row>
      <Row label={t("settings.history.export")} description={t("settings.history.export.desc")}><Pill disabled={!n} onClick={exportJson}>{t("settings.history.exportBtn")}</Pill></Row>
      <Row label={t("settings.history.clear")} description={t("settings.history.clear.desc")}><ConfirmButton disabled={!n} confirmLabel={t("settings.history.clearConfirm")} onConfirm={() => useHistory.getState().clear()}>{t("settings.history.clearBtn")}</ConfirmButton></Row>
    </SectionCard>
  )
}
