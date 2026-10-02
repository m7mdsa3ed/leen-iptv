import { Card, Rail } from "@/components/gtv"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { useSafe } from "./safe"

const MAX = 3 // rails per kind

/** Kids Home: Continue watching, then a few movie and show category rails; only allowed categories. */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const safe = useSafe()
  const rails = h.rails
    .filter((r) => r.key === "cont" || r.key.startsWith("movie") || r.key.startsWith("series"))
    .map((r) => ({ ...r, items: r.items.filter((i) => i.kind !== "live" && safe.item(i)) }))
    .filter((r) => r.items.length)
  const pick = (p: string) => rails.filter((r) => r.key.startsWith(p)).slice(0, MAX)
  const list = [...rails.filter((r) => r.key === "cont"), ...pick("movie"), ...pick("series")]
  return (
    <Shell page="home" title={t("kd.home.title")}>
      {h.status !== "ready" ? <Pending /> : !list.length ? <Empty>{t("kd.home.empty")}</Empty> : (
        <div className="flex flex-col gap-4 pb-8">
          {list.map((r) => (
            <Rail key={r.key} title={<span className="kd-h">{r.title}</span>}>
              {r.items.map((i) => <Card key={i.id} item={i} variant="poster" className="kd-card" pct={r.pct?.(i)} onOpen={() => h.open(i, r.items)} />)}
            </Rail>
          ))}
        </div>
      )}
    </Shell>
  )
}
