import { useEffect } from "react"
import { ConfirmButton, Pill, Row, SectionCard } from "../controls"
import { useHistory } from "@/lib/history"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"

/** Watch history + stats (data stays on this device, per profile). */
export default function HistorySection() {
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
    <SectionCard description={`${n} sessions saved for this profile.`}>
      <Row label="History" description="What you watched, and when."><Pill variant="primary" onClick={() => go("history")}>View history</Pill></Row>
      <Row label="Stats" description="Watch time and stream quality."><Pill onClick={() => go("stats")}>View stats</Pill></Row>
      <Row label="Export" description="Download as a JSON file."><Pill disabled={!n} onClick={exportJson}>Export JSON</Pill></Row>
      <Row label="Clear" description="Deletes history and stats for this profile."><ConfirmButton disabled={!n} confirmLabel="Press again to clear all" onConfirm={() => useHistory.getState().clear()}>Clear history and stats</ConfirmButton></Row>
    </SectionCard>
  )
}
