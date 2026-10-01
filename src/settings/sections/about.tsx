import { useEffect, useState } from "react"
import { LeenMark } from "@/components/gtv"
import { Pill, Row, SectionCard } from "../controls"
import pkg from "../../../package.json"
import { useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { useApp } from "@/lib/store"
import { useSources } from "@/lib/sources"

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`
const ua = () => {
  const u = navigator.userAgent
  return (u.match(/(Web0S|webOS|SmartTV|Android|iPhone|iPad|Windows|Macintosh|Linux)[^;)]*/i)?.[0] ?? "") + " / " + (u.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? "")
}

export default function AboutSection() {
  const mode = useMode()
  const layout = useApp((s) => s.settings.layout)
  const sources = useSources()
  const stat = useCatalog((s) => s.sources)
  const [store, setStore] = useState("")
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => e.usage != null && setStore(`${mb(e.usage)}${e.quota ? ` of ${mb(e.quota)}` : ""}`)).catch(() => {})
  }, [])
  return (
    <div className="flex flex-col gap-4">
      <SectionCard>
        <div className="flex items-center gap-4"><LeenMark className="size-14" /><div><div className="text-xl font-medium">Leen IPTV</div><div className="text-sm text-muted-foreground">Version {pkg.version}</div></div></div>
      </SectionCard>
      <SectionCard title="This device">
        <Row label="Screen mode">{mode}</Row>
        <Row label="Layout">{layout}</Row>
        <Row label="Browser" description={ua()} />
        {store && <Row label="Storage used">{store}</Row>}
      </SectionCard>
      <SectionCard title="Source health" description="Reloads each enabled source and shows the result.">
        {sources.map((s) => {
          const st = stat[s.id]
          return (
            <Row key={s.id} label={s.name} description={st?.status === "error" ? st.msg : st?.status === "ready" ? `OK - ${st.count} items` : st?.status === "loading" ? "Checking..." : "Not loaded"}>
              <Pill disabled={st?.status === "loading"} onClick={() => void useCatalog.getState().retry(s.id)}>Check health</Pill>
            </Row>
          )
        })}
        {!sources.length && <div className="text-sm text-muted-foreground">No enabled sources.</div>}
      </SectionCard>
      <SectionCard><Row label="Reload app"><Pill onClick={() => location.reload()}>Reload</Pill></Row></SectionCard>
    </div>
  )
}
