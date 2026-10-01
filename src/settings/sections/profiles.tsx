import { useState } from "react"
import { Pill, Row, SectionCard, Field } from "../controls"
import { askPin } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { isTv } from "@/lib/device"
import { useApp, useProfile } from "@/lib/store"

export default function ProfilesSection() {
  const p = useProfile()
  const { updateProfile, removeProfile, profiles } = useApp()
  const reset = useRoute((s) => s.reset)
  const [pin, setPin] = useState("")
  if (!p) return null
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={`Profile: ${p.name}`}>
        <Row label="Switch profile"><Pill onClick={() => reset("profiles")}>Switch profile</Pill></Row>
        {profiles.length > 1 && (
          <Row label="Delete profile" description="Removes this profile's favorites, progress and history.">
            <Pill onClick={async () => { if (p.pin && !(await askPin(p.pin))) return; removeProfile(p.id); reset("profiles") }}>Delete profile</Pill>
          </Row>
        )}
      </SectionCard>
      <SectionCard title="PIN" description={isTv ? "With a PIN set, press Yellow on a category in Live/Movies/Series to lock it." : "With a PIN set, right-click (or long-press) a category in Live/Movies/Series to lock it."}>
        <Field label={p.pin ? "New PIN (4 digits)" : "Set PIN (4 digits)"} inputMode="numeric" maxLength={4} value={pin} onChange={(v) => setPin(v.replace(/\D/g, ""))} error={pin && pin.length !== 4 ? "The PIN must be 4 digits." : undefined} />
        <div className="flex flex-wrap gap-2">
          <Pill variant="primary" disabled={pin.length !== 4} onClick={async () => { if (p.pin && !(await askPin(p.pin))) return; updateProfile(p.id, { pin }); setPin("") }}>Save PIN</Pill>
          {p.pin && <Pill onClick={async () => (await askPin(p.pin!)) && updateProfile(p.id, { pin: undefined, locked: [] })}>Remove PIN</Pill>}
        </div>
      </SectionCard>
    </div>
  )
}
