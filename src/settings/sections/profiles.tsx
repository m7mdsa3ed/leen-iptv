import { useRef, useState } from "react"
import { ConfirmButton, Pill, Row, SectionCard, Field } from "../controls"
import { askPin } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import { isTv } from "@/lib/device"
import { useApp, useProfile } from "@/lib/store"
import { photoFromFile } from "@/lib/photo"
import { Avatar } from "@/components/gtv"

export default function ProfilesSection() {
  const t = useT()
  const p = useProfile()
  const { updateProfile, removeProfile, profiles } = useApp()
  const reset = useRoute((s) => s.reset)
  const [pin, setPin] = useState("")
  const file = useRef<HTMLInputElement>(null)
  if (!p) return null
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={<>{t("settings.profiles.profile")} <bdi>{p.name}</bdi></>}>
        <Row label={t("settings.profiles.photo")} description={t("settings.profiles.photo.desc")}>
          <Avatar name={p.name} color={p.color} photo={p.photo} className="size-12 text-xl" />
          <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) try { updateProfile(p.id, { photo: await photoFromFile(f) }) } catch { /* not an image the browser can decode */ }
          }} />
          <Pill onClick={() => file.current?.click()}>{t("settings.profiles.photo.change")}</Pill>
          {p.photo && <Pill onClick={() => updateProfile(p.id, { photo: undefined })}>{t("settings.profiles.photo.remove")}</Pill>}
        </Row>
        <Row label={t("settings.profiles.switch")}><Pill onClick={() => reset("profiles")}>{t("settings.profiles.switch")}</Pill></Row>
        {profiles.length > 1 && (
          <Row label={t("settings.profiles.delete")} description={t("settings.profiles.delete.desc")}>
            <ConfirmButton onConfirm={async () => { if (p.pin && !(await askPin(p.pin))) return; removeProfile(p.id); reset("profiles") }}>{t("settings.profiles.delete")}</ConfirmButton>
          </Row>
        )}
      </SectionCard>
      <SectionCard title={t("settings.profiles.pin")} description={t(isTv ? "settings.profiles.pin.tv" : "settings.profiles.pin.other")}>
        <Field label={t(p.pin ? "settings.profiles.pin.new" : "settings.profiles.pin.set")} dir="ltr" inputMode="numeric" maxLength={4} value={pin} onChange={(v) => setPin(v.replace(/\D/g, ""))} error={pin && pin.length !== 4 ? t("settings.profiles.pin.bad") : undefined} />
        <div className="m-fill flex flex-wrap gap-2">
          <Pill variant="primary" disabled={pin.length !== 4} onClick={async () => { if (p.pin && !(await askPin(p.pin))) return; updateProfile(p.id, { pin }); setPin("") }}>{t("settings.profiles.pin.save")}</Pill>
          {p.pin && <Pill onClick={async () => (await askPin(p.pin!)) && updateProfile(p.id, { pin: undefined, locked: [] })}>{t("settings.profiles.pin.remove")}</Pill>}
        </div>
      </SectionCard>
    </div>
  )
}
