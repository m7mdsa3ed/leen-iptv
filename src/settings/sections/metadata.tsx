import { ChevronDown, ChevronUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ConfirmButton, Field, Pill, RoundButton, Row, SectionCard, ToggleRow } from "../controls"
import { cacheCount, clearMetaCache } from "@/lib/meta/cache"
import { normalizeCfg } from "@/lib/meta"
import { fetchPosters, uploadLocal } from "@/lib/meta/backfill"
import { clearPosters } from "@/lib/catalog"
import { sharedCounts } from "@/lib/meta/shared"
import { PROVIDERS } from "@/lib/meta/providers"
import type { ProviderCfg } from "@/lib/meta/types"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"

/** Movie/series info providers, tried top to bottom (first non-empty value per field wins; ratings from all are kept). */
export default function MetadataSection() {
  const { settings, setSettings } = useApp()
  const t = useT()
  const cfgs = normalizeCfg(settings.meta)
  const shared = settings.sharedMeta !== false
  const [cached, setCached] = useState(0)
  const [rows, setRows] = useState<{ total: number; ids: number } | null | undefined>(undefined) // undefined = loading, null = not available
  const loadRows = () => { setRows(undefined); void sharedCounts().then(setRows) }
  const [up, setUp] = useState<{ done: number; total: number; wait: boolean } | null>(null)
  const [upMsg, setUpMsg] = useState("")
  const stop = useRef(false)
  const [pst, setPst] = useState<{ done: number; total: number; wait: boolean } | null>(null)
  const [pMsg, setPMsg] = useState("")
  useEffect(() => () => { stop.current = true }, [])
  /** Replace posters: fetch the metadata poster of every movie/series (stops when this page closes; the next run skips what is done). */
  const runPosters = async () => {
    if (pst) return
    stop.current = false
    setPMsg("")
    setPst({ done: 0, total: 0, wait: false })
    const r = await fetchPosters(stop, (done, total, wait) => setPst({ done, total, wait }))
    setPst(null)
    setPMsg(!r.usable ? t("settings.meta.posters.noProvider") : t(r.done < r.total ? "settings.meta.posters.partial" : "settings.meta.posters.done", { done: fmt.number(r.done), total: fmt.number(r.total), found: fmt.number(r.found) }))
  }
  /** Put this device's saved lookups into the shared table (runs when sharing is switched on, or from the button). */
  const upload = async () => {
    if (up) return
    stop.current = false
    setUpMsg("")
    setUp({ done: 0, total: 0, wait: false })
    const r = await uploadLocal(stop, (done, total, wait) => setUp({ done, total, wait }))
    setUp(null)
    setUpMsg(!r.usable ? t("settings.meta.rows.none") : r.done < r.total && !stop.current
      ? t("settings.meta.up.partial", { done: fmt.number(r.done), total: fmt.number(r.total), why: r.error || t("settings.meta.up.why") })
      : t("settings.meta.up.done", { ids: fmt.number(r.ids), titles: fmt.number(r.titles) }))
    loadRows()
  }
  useEffect(() => { void cacheCount().then(setCached) }, [])
  useEffect(loadRows, [shared])
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
      <SectionCard title={t("settings.meta.posters")} description={t("settings.meta.posters.desc")}>
        <ToggleRow label={t("settings.meta.posters.use")} checked={!!settings.metaPosters} onChange={(v) => { setSettings({ metaPosters: v }); if (v) void runPosters() }} />
        {settings.metaPosters && (
          <Row label={pst ? t(pst.wait ? "settings.meta.posters.wait" : "settings.meta.posters.running", { done: fmt.number(pst.done), total: fmt.number(pst.total) }) : t("settings.meta.posters.run")} description={pst ? undefined : pMsg}>
            {pst ? <Pill onClick={() => { stop.current = true }}>{t("settings.meta.up.stop")}</Pill> : <Pill onClick={() => void runPosters()}>{t("settings.meta.posters.go")}</Pill>}
          </Row>
        )}
        {settings.metaPosters && !pst && <Row label={t("settings.meta.posters.reset")} description={t("settings.meta.posters.reset.desc")}><Pill onClick={clearPosters}>{t("settings.meta.posters.resetGo")}</Pill></Row>}
      </SectionCard>
      <SectionCard title={t("settings.meta.cache")} description={t("settings.meta.cache.desc")}>
        <ToggleRow label={t("settings.meta.shared")} description={t("settings.meta.shared.desc")} checked={shared} onChange={(v) => { setSettings({ sharedMeta: v }); if (v) void upload() }} />
        <Row label={rows === undefined ? t("settings.meta.rows.loading") : rows ? t("settings.meta.rows", { n: fmt.number(rows.total), ids: fmt.number(rows.ids) }) : t("settings.meta.rows.none")} description={t("settings.meta.rows.desc")}>
          <Pill onClick={loadRows}>{t("settings.meta.rows.refresh")}</Pill>
        </Row>
        {shared && (
          <Row label={up ? t(up.wait ? "settings.meta.up.wait" : "settings.meta.up.running", { done: fmt.number(up.done), total: fmt.number(up.total) }) : t("settings.meta.up")} description={up ? undefined : upMsg || t("settings.meta.up.desc")}>
            {up ? <Pill onClick={() => { stop.current = true }}>{t("settings.meta.up.stop")}</Pill> : <Pill disabled={!cached} onClick={() => void upload()}>{t("settings.meta.up.go")}</Pill>}
          </Row>
        )}
        <Row label={t("settings.meta.cache.count", { n: cached })}>
          <ConfirmButton onConfirm={() => void clearMetaCache().then(() => setCached(0))} disabled={!cached}>{t("settings.meta.cache.clear")}</ConfirmButton>
        </Row>
      </SectionCard>
    </div>
  )
}
