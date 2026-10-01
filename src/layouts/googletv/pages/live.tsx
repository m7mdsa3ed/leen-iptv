import { Star, Tv } from "lucide-react"
import { GroupList } from "@/components/tv/groups"
import { Pill } from "@/components/gtv"
import { Empty, Logo, Shell, VGrid, Pending, useK } from "@/components/tv/ui"
import { SourceBadge, SourceFilter } from "../source-ui"
import { progressPct, useLive } from "@/layouts/hooks/use-live"
import { useMode } from "@/lib/device"
import { KEY, useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"

/** Google TV Live: channel tile grid (logo, number, now playing + progress) under category pills; guide link. */
export default function Live() {
  const { groups, status, g, setG, items, nowOf, isFav, toggleFav, open } = useLive()
  const mode = useMode()
  const t = useT()
  const go = useRoute((s) => s.go)
  const k = useK()
  return (
    <Shell page="live" title={t("gtv.live.title")}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span />
            <Pill onClick={() => go("guide")}><Tv />{t("gtv.live.guide")}</Pill>
          </div>
          <SourceFilter />
          <GroupList kind="live" groups={groups} active={g} onPick={setG} />
          <div className="min-h-0 flex-1">
            {items.length ? (
              <VGrid items={items} ratio={0.5625} label={78} minW={mode === "tv" ? 330 : mode === "mobile" ? 150 : 250} render={(i) => {
                const { now: n, next: nx } = nowOf(i)
                return (
                  <button key={i.id} data-nav data-card data-id={i.id} onClick={() => open(i, items)} onKeyDown={(e) => e.keyCode === KEY.red && toggleFav(i)} onContextMenu={(e) => { if (mode !== "tv") { e.preventDefault(); toggleFav(i) } }} className="block w-full min-w-0 text-start">
                    <div data-tilewrap className="relative rounded-2xl">
                      <div data-tile className="relative aspect-video overflow-hidden rounded-[inherit] bg-gradient-to-br from-surface-3 to-surface">
                        <Logo item={i} className="size-full p-6" />
                        <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white">{i.num ?? "•"}</span>
                        {isFav(i) && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/60"><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
                        <SourceBadge item={i} className="absolute bottom-2 end-2" />
                        {n && <div dir="ltr" data-ltr className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent-blue" style={{ width: `${progressPct(n.s, n.e)}%` }} /></div>}
                      </div>
                      <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
                    </div>
                    <div className="mt-2 px-1" style={{ minHeight: 62 * k }}>
                      <div dir="auto" className="truncate text-base">{i.name}</div>
                      <div dir="auto" className="truncate text-sm text-muted-foreground">{n ? n.t : t("gtv.live.noGuide")}</div>
                      {nx && <div dir="auto" className="truncate text-xs text-muted-foreground">{t("gtv.live.next", { title: nx.t })}</div>}
                    </div>
                  </button>
                )
              }} />
            ) : <Empty>{t("gtv.live.empty")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
