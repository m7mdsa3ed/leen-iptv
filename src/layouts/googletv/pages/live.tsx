import { memo } from "react"
import { Star } from "lucide-react"
import { GroupList, liveRowMenu } from "@/components/tv/groups"
import { Empty, Logo, Shell, VGrid, Pending, useK } from "@/components/tv/ui"
import { SourceBadge, SourceFilter } from "../source-ui"
import { useLive } from "@/layouts/hooks/use-live"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useBadges } from "@/lib/sources"
import type { Item } from "@/lib/types"

/** One channel tile (logo, number, favourite star, source badge). Memoised: pass stable onOpen / onFav (the page's hook functions). */
const LiveTile = memo(function LiveTile({ item: i, fav, onOpen, onFav, mode, k, badge }: { item: Item; fav: boolean; onOpen: (i: Item) => void; onFav: (i: Item) => void; mode: string; k: number; badge: boolean }) {
  return (
    <button data-nav data-card data-id={i.id} onClick={() => onOpen(i)} {...liveRowMenu(i, mode, onFav)} className="block w-full min-w-0 text-start">
      <div data-tilewrap className="relative rounded-2xl">
        <div data-tile className="relative aspect-video overflow-hidden rounded-[inherit] bg-gradient-to-br from-surface-3 to-surface">
          <Logo item={i} className="size-full p-6" />
          <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white">{i.num ?? "•"}</span>
          {fav && <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-black/60"><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
          <SourceBadge item={i} on={badge} className="absolute bottom-2 end-2" />
        </div>
        <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="mt-2 px-1" style={{ minHeight: 62 * k }}>
        <div dir="auto" className="truncate text-base">{i.name}</div>
      </div>
    </button>
  )
})

/** Google TV Live: channel tile grid (logo, number) under category pills. */
export default function Live() {
  const { groups, status, g, setG, items, isFav, toggleFav, open } = useLive()
  const mode = useMode()
  const t = useT()
  const k = useK()
  const badge = useBadges()
  return (
    <Shell page="live" title={t("gtv.live.title")}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        (() => {
          const filters = (<>
            <SourceFilter />
            <GroupList kind="live" groups={groups} active={g} onPick={setG} />
          </>)
          const grid = (head?: React.ReactNode, cls?: string) => (
              <VGrid items={items} head={head} className={cls} ratio={0.5625} label={78} minW={mode === "tv" ? 330 : mode === "mobile" ? 150 : 250} render={(i) => <LiveTile key={i.id} item={i} fav={isFav(i)} onOpen={open} onFav={toggleFav} mode={mode} k={k} badge={badge} />} />
          )
          // mobile: filters + grid scroll together and start under the top bar (content fades under both bar gradients)
          // one tree whether or not the category has channels: a different root would remount the focused group chip (an empty Favorites)
          return grid(<div className="flex flex-col gap-2">{filters}{!items.length && <div className="h-[50vh]"><Empty>{t("gtv.live.empty")}</Empty></div>}</div>, "under-top")
        })()
      )}
    </Shell>
  )
}
