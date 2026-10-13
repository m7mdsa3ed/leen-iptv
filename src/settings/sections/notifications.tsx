import { useState } from "react"
import { Field, Pill, Row, SectionCard, ToggleRow } from "../controls"
import { useApp } from "@/lib/store"
import { useT } from "@/lib/i18n"
import { notificationPermission, notificationsSupported, requestNotifications } from "@/lib/notify"

type N = NonNullable<ReturnType<typeof useApp.getState>["settings"]["notify"]>

/** Settings > Notifications: master switch and system permission (this device), one switch per kind (synced with the account). Alerts only fire while the app is open. */
export default function NotificationsSection() {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const n = settings.notify ?? {}
  const kick = settings.sportsNotify
  const save = (p: Partial<N>) => setSettings({ notify: { ...n, ...p } })
  const saveKick = (p: Partial<{ enabled: boolean; lead: number }>) => setSettings({ sportsNotify: { enabled: kick?.enabled ?? false, lead: kick?.lead ?? 15, ...p } })
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => notificationPermission())
  const permText = perm === "granted" ? t("settings.sports.permission.granted") : perm === "denied" ? t("settings.sports.permission.denied") : perm === "unsupported" ? t("settings.sports.permission.unsupported") : t("settings.sports.permission.default")
  const askPerm = async () => setPerm(notificationsSupported() ? await requestNotifications() : "unsupported")
  const on = !settings.notifyOff

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.notify.intro")}</p>
      <SectionCard title={t("settings.sec.notifications")}>
        <ToggleRow label={t("settings.notify.master")} description={t("settings.notify.master.desc")} checked={on} onChange={(v) => setSettings({ notifyOff: !v })} />
        {perm !== "unsupported" && (
          <Row label={t("settings.sports.allow")} description={permText}>
            {perm !== "granted" && <Pill onClick={() => void askPerm()}>{t("settings.sports.allow")}</Pill>}
          </Row>
        )}
      </SectionCard>
      {on && (
        <>
          <SectionCard title={t("settings.notify.sports")} description={t("settings.notify.sports.desc")}>
            <ToggleRow label={t("settings.sports.notify")} checked={kick?.enabled ?? false} onChange={(v) => saveKick({ enabled: v })} />
            {kick?.enabled && <Field label={t("settings.sports.lead")} inputMode="numeric" value={String(kick?.lead ?? 15)} onChange={(v) => saveKick({ lead: Math.max(0, Math.min(1440, Number(v.replace(/\D/g, "")) || 0)) })} />}
            <ToggleRow label={t("settings.notify.digest")} description={t("settings.notify.digest.desc")} checked={!!n.digest} onChange={(v) => save({ digest: v })} />
            <ToggleRow label={t("settings.notify.live")} checked={!!n.live} onChange={(v) => save({ live: v })} />
            <ToggleRow label={t("settings.notify.final")} checked={!!n.final} onChange={(v) => save({ final: v })} />
          </SectionCard>
          <SectionCard title={t("settings.notify.shows")}>
            <ToggleRow label={t("settings.notify.episodes")} description={t("settings.notify.episodes.desc")} checked={n.episodes !== false} onChange={(v) => save({ episodes: v })} />
          </SectionCard>
        </>
      )}
    </div>
  )
}
