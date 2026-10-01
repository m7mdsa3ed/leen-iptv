import { Field, SectionCard } from "../controls"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

export default function NetworkSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const bad = settings.proxy && !/^https?:\/\//.test(settings.proxy)
  return (
    <SectionCard title={t("settings.network.title")} description={t("settings.network.desc")}>
      <Field label={t("settings.network.url")} type="url" dir="ltr" inputMode="url" placeholder={t("settings.network.urlPh")} value={settings.proxy} onChange={(v) => setSettings({ proxy: v.trim() })} error={bad ? t("settings.network.urlBad") : undefined} />
    </SectionCard>
  )
}
