import { GroupList } from "@/components/tv/groups"
import { hm } from "@/lib/catalog"
import { Empty, Pending, Shell, VGrid } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import { fmt, useT } from "@/lib/i18n"
import { progressPct, useLive } from "../../hooks/use-live"
import { SourceFilter, Tile } from "../ui"

/** Live: big title + category capsules over a grid of channel tiles (logo, number, now playing + progress). Red = favorite. */
export default function Live() {
  const t = useT()
  const L = useLive()
  const mode = useMode()
  return (
    <Shell page="live" title={t("atv.live.title")}>
      {L.status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex h-full flex-col">
          <div className="flex items-baseline gap-4 pb-1 pt-4"><h1 className="atv-h1 text-[2.5rem]">{t("atv.live.heading")}</h1><span className="text-lg text-muted-foreground">{fmt.plural("atv.live.channels", L.items.length)}</span></div>
          <SourceFilter />
          <div className="atv-chips"><GroupList kind="live" groups={L.groups} active={L.g} onPick={L.setG} /></div>
          <div className="min-h-0 flex-1">
            {L.items.length ? (
              <VGrid items={L.items} ratio={9 / 16} label={72} minW={mode === "tv" ? 330 : mode === "mobile" ? 240 : 290} render={(i) => {
                const n = L.nowOf(i).now
                return (
                  <Tile key={i.id} item={i} size="fluid" always title={`${i.num ?? ""} ${i.name}`.trim()} sub={n ? `${hm(n.s)} ${n.t}` : t("atv.live.noGuide")} pct={n ? Math.max(2, progressPct(n.s, n.e)) : undefined}
                    onOpen={() => L.open(i, L.items)} onKeyDown={(e) => { if (e.keyCode === KEY.red) L.toggleFav(i) }}
                    onContextMenu={(e) => { if (mode !== "tv") { e.preventDefault(); L.toggleFav(i) } }} />
                )
              }} />
            ) : <Empty>{t("atv.live.none")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
