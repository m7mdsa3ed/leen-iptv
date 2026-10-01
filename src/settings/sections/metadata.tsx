import { ChevronDown, ChevronUp } from "lucide-react"
import { Field, RoundButton, SectionCard, ToggleRow } from "../controls"
import { normalizeCfg } from "@/lib/meta"
import { PROVIDERS } from "@/lib/meta/providers"
import type { ProviderCfg } from "@/lib/meta/types"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

/** Movie/series info providers, tried top to bottom (first non-empty value per field wins; ratings from all are kept). */
export default function MetadataSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const cfgs = normalizeCfg(settings.meta)
  const save = (next: ProviderCfg[]) => setSettings({ meta: next })
  const patch = (id: string, p: Partial<ProviderCfg>) => save(cfgs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const move = (i: number, d: number) => {
    const n = [...cfgs], j = i + d
    if (j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j], n[i]]
    save(n)
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("settings.meta.intro")}</p>
      {cfgs.map((c, i) => {
        const p = PROVIDERS.find((x) => x.id === c.id)!
        const name = c.id === "xtream" ? t("settings.meta.xtreamName") : p.name
        return (
          <SectionCard key={c.id} title={`${fmt.number(i + 1)}. ${name}`} description={t(`settings.meta.${c.id}${c.id === "xtream" ? "Desc" : "Hint"}`)}>
            <ToggleRow label={t("settings.meta.use", { name })} checked={c.enabled} onChange={(v) => patch(c.id, { enabled: v })} />
            {p.needsKey && <Field label={t("settings.meta.apiKey")} type="password" dir="ltr" value={c.key ?? ""} onChange={(v) => patch(c.id, { key: v.trim() })} error={c.enabled && !c.key ? t("settings.meta.keyNeeded") : undefined} />}
            {p.hasLang && <Field label={t("settings.meta.language")} dir="ltr" placeholder={t("settings.meta.languagePh")} className="max-w-[20rem]" value={c.lang ?? ""} onChange={(v) => patch(c.id, { lang: v.trim() })} />}
            <div className="flex gap-2">
              <RoundButton label={t("settings.meta.moveUp")} aria-disabled={i === 0} className={i === 0 ? "opacity-50" : ""} onClick={() => move(i, -1)}><ChevronUp /></RoundButton>
              <RoundButton label={t("settings.meta.moveDown")} aria-disabled={i === cfgs.length - 1} className={i === cfgs.length - 1 ? "opacity-50" : ""} onClick={() => move(i, 1)}><ChevronDown /></RoundButton>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
