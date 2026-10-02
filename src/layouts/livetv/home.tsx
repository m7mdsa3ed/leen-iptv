import { Empty, Shell, TvButton } from "@/components/tv/ui"
import { Card, Rail, SkelRail } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"

const ORDER = ["live", "cont", "favs", "recents"] // YouTube TV Home: what is on now first, then your own rows, then genre rows

/** YouTube TV Home: plain stack of wide-tile rails (no hero): live now, continue watching, library, genres. */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const rails = [...h.rails].sort((a, b) => (ORDER.indexOf(a.key) + 1 || 99) - (ORDER.indexOf(b.key) + 1 || 99))
  return (
    <Shell page="home" title={t("lv.home.title")}>
      {h.status === "loading" && <div role="status" className="pt-4"><SkelRail variant="wide" /><SkelRail variant="wide" /></div>}
      {h.status === "error" && <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div><TvButton onClick={h.retry}>{t("gtv.home.retry")}</TvButton></div></Empty>}
      {h.status === "ready" && (
        <div className="h-full overflow-y-auto px-[var(--gx)] [scroll-padding-bottom:4rem] -mx-[var(--gx)]">
          {!h.rails.length && <Empty>{t("lv.home.empty")}</Empty>}
          {rails.map((r) => (
            <Rail key={r.key} title={r.title} onSeeAll={r.seeAll}>
              {r.items.map((i) => <Card key={i.id} item={i} variant={r.card ?? r.kind} pct={r.pct?.(i)} sub={r.sub?.(i)} onOpen={() => h.open(i, r.items)} />)}
            </Rail>
          ))}
        </div>
      )}
    </Shell>
  )
}
