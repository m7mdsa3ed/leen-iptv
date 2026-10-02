import { Tv } from "lucide-react"
import { Chips, Empty, Pending, Shell } from "@/components/tv/ui"
import { fmt, useT } from "@/lib/i18n"
import { ALL, FAV, progressPct, useLive } from "../../hooks/use-live"
import { useRoute } from "@/lib/nav"
import { PagedGrid, SourceBar, Tile } from "../ui"
import type { Item } from "@/lib/types"

/** Live: category chips + grid of 16:9 channel tiles; under the name: now playing (with progress bar) and what is next. */
export default function Live() {
  const L = useLive()
  const t = useT()
  const go = useRoute((s) => s.go)
  const tile = (i: Item) => {
    const { now, next } = L.nowOf(i)
    const sub = now ? `${fmt.time(now.s)} ${now.t}${next ? `  ›  ${next.t}` : ""}` : t("pv.live")
    return <Tile key={i.id} item={i} pct={now ? progressPct(now.s, now.e) : undefined} sub={sub} onOpen={() => L.open(i, L.items)} />
  }
  return (
    <Shell page="live" title={t("pv.live.title")}>
      {L.status !== "ready" ? <Pending shape="grid" /> : (
        <div className="pv-page">
          <div className="pv-bar">
            <h1 className="pv-h1">{t("pv.live.title")}</h1>
            <button data-nav onClick={() => go("guide")} className="pv-btn pv-sec"><Tv />{t("pv.live.guide")}</button>
          </div>
          <Chips cat items={[ALL, FAV, ...L.groups]} active={L.g} onPick={L.setG} />
          <SourceBar />
          {L.items.length ? <PagedGrid items={L.items} render={tile} /> : <div className="h-64"><Empty>{t("pv.live.none")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
