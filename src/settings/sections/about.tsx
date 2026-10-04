import { LAYOUTS_META } from "@/lib/layouts"
import { useEffect, useState } from "react"
import { LeenMark } from "@/components/gtv"
import { Pill, Row, SectionCard } from "../controls"
import pkg from "../../../package.json"
import { useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { fmt, t, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { useRoute } from "@/lib/nav"
import { useSources } from "@/lib/sources"

const mb = (n: number) => t("settings.about.mb", { n: fmt.number(Math.round(n / 104857.6) / 10) })
const ua = () => {
  const u = navigator.userAgent
  return (u.match(/(Web0S|webOS|SmartTV|Android|iPhone|iPad|Windows|Macintosh|Linux)[^;)]*/i)?.[0] ?? "") + " / " + (u.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? "")
}

export default function AboutSection() {
  const t = useT()
  const mode = useMode()
  const layout = useApp((s) => s.settings.layout)
  const sources = useSources()
  const stat = useCatalog((s) => s.sources)
  const go = useRoute((s) => s.go)
  const [store, setStore] = useState("")
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => e.usage != null && setStore(e.quota ? t("settings.about.storageOf", { used: mb(e.usage), total: mb(e.quota) }) : mb(e.usage))).catch(() => {})
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <div className="flex items-center gap-4"><LeenMark className="size-16" /><div><div className="text-4xl"><span className="wordmark">Leen</span> <span className="text-base text-muted-foreground">TV</span></div><div className="text-sm text-muted-foreground">{t("settings.about.version", { v: pkg.version })}</div></div></div>
      </SectionCard>
      <SectionCard title={t("settings.about.device")}>
        <Row label={t("settings.about.screenMode")}>{t(`settings.mode.${mode}`)}</Row>
        <Row label={t("settings.about.layout")}>{LAYOUTS_META.find((l) => l.id === layout)?.name ?? layout}</Row>
        <Row label={t("settings.about.browser")} description={<span dir="ltr" className="inline-block">{ua()}</span>} />
        {store && <Row label={t("settings.about.storage")}>{store}</Row>}
      </SectionCard>
      <SectionCard title={t("settings.about.health")} description={t("settings.about.health.desc")}>
        {sources.map((s) => {
          const st = stat[s.id]
          return (
            <Row key={s.id} label={<bdi>{s.name}</bdi>} description={st?.status === "error" ? st.msg : st?.status === "ready" ? t("settings.about.ok", { items: fmt.plural("settings.sources.items", st.count) }) : st?.status === "loading" ? t("settings.about.checking") : t("settings.about.notLoaded")}>
              <Pill disabled={st?.status === "loading"} onClick={() => void useCatalog.getState().retry(s.id)}>{t("settings.about.check")}</Pill>
            </Row>
          )
        })}
        {!sources.length && <div className="text-sm text-muted-foreground">{t("settings.about.noSources")}</div>}
      </SectionCard>
      <SectionCard><Row label={t("diag.title")} description={t("diag.entry.desc")}><Pill onClick={() => go("diagnostics")}>{t("diag.entry")}</Pill></Row></SectionCard>
      <SectionCard><Row label={t("settings.about.reloadRow")}><Pill onClick={() => location.reload()}>{t("settings.about.reload")}</Pill></Row></SectionCard>
    </div>
  )
}
