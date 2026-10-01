import { Field, SectionCard } from "../controls"
import { useApp } from "@/lib/store"

export default function NetworkSection() {
  const { settings, setSettings } = useApp()
  const bad = settings.proxy && !/^https?:\/\//.test(settings.proxy)
  return (
    <SectionCard title="CORS proxy" description="Only needed when the app is not served by its own proxy (pnpm proxy / dev server).">
      <Field label="Proxy URL" type="url" inputMode="url" placeholder="http://host:8787 or https://proxy.corsfix.com/?" value={settings.proxy} onChange={(v) => setSettings({ proxy: v.trim() })} error={bad ? "Start with http:// or https://" : undefined} />
    </SectionCard>
  )
}
