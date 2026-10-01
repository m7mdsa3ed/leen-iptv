import { ChevronDown, ChevronUp } from "lucide-react"
import { Field, RoundButton, SectionCard, ToggleRow } from "../controls"
import { normalizeCfg } from "@/lib/meta"
import { PROVIDERS } from "@/lib/meta/providers"
import type { ProviderCfg } from "@/lib/meta/types"
import { useApp } from "@/lib/store"

/** Movie/series info providers, tried top to bottom (first non-empty value per field wins; ratings from all are kept). */
export default function MetadataSection() {
  const { settings, setSettings } = useApp()
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
      <p className="text-sm text-muted-foreground">Details, cast, ratings and similar titles for movies and series. Providers are tried top to bottom and the first one with a value wins; ratings from all are shown. Results are cached for a week.</p>
      {cfgs.map((c, i) => {
        const p = PROVIDERS.find((x) => x.id === c.id)!
        return (
          <SectionCard key={c.id} title={`${i + 1}. ${p.name}`} description={c.id === "xtream" ? "What your panel already provides (plot, genre, cast, rating and TMDB/IMDb ids that make the other providers exact)." : p.hint}>
            <ToggleRow label={`Use ${p.name}`} checked={c.enabled} onChange={(v) => patch(c.id, { enabled: v })} />
            {p.needsKey && <Field label="API key" type="password" value={c.key ?? ""} onChange={(v) => patch(c.id, { key: v.trim() })} error={c.enabled && !c.key ? "A key is needed for this provider." : undefined} />}
            {p.hasLang && <Field label="Language" placeholder="e.g. en-US or ar-SA" className="max-w-[20rem]" value={c.lang ?? ""} onChange={(v) => patch(c.id, { lang: v.trim() })} />}
            <div className="flex gap-2">
              <RoundButton label="Move up" aria-disabled={i === 0} className={i === 0 ? "opacity-50" : ""} onClick={() => move(i, -1)}><ChevronUp /></RoundButton>
              <RoundButton label="Move down" aria-disabled={i === cfgs.length - 1} className={i === cfgs.length - 1 ? "opacity-50" : ""} onClick={() => move(i, 1)}><ChevronDown /></RoundButton>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
