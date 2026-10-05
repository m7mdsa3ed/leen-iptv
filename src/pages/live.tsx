import { Star } from "lucide-react"
import { GroupList, liveRowMenu } from "@/components/tv/groups"
import { SourceFilter } from "@/components/source/SourceFilter"
import { SourceBadge } from "@/components/source/SourceBadge"
import { Empty, Logo, Shell, VGrid, Pending, useK } from "@/components/tv/ui"
import { useLive } from "@/layouts/hooks/use-live"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"

export default function Live() {
  const { groups, status, g, setG, items, sel, setSel, isFav, toggleFav, open } = useLive()
  const mode = useMode()
  const t = useT()
  const k = useK()
  const cellH = 84

  return (
    <Shell page="live" title={t("pages.live.title")}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        (() => {
          const head = (<>
          <SourceFilter />
          <GroupList kind="live" groups={groups} active={g} onPick={setG} />
          <div className="flex min-h-[5.5rem] shrink-0 items-center gap-4 rounded-[28px] bg-surface p-3 pe-5">
            {sel ? (
              <>
                <Logo item={sel} className="size-16 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-medium"><span className="me-2 text-muted-foreground"><bdi dir="ltr">{sel.num}</bdi></span><span dir="auto">{sel.name}</span><SourceBadge item={sel} className="ms-2 align-middle" /></div>
                </div>
              </>
            ) : <div className="px-2 text-muted-foreground">{mode === "tv" ? t("pages.live.selectTv") : t("pages.live.select")}</div>}
          </div>
          </>)
          const grid = (h?: React.ReactNode, cls?: string) => (
              <VGrid items={items} head={h} className={cls} ratio={0} label={cellH} minW={mode === "tv" ? 340 : 280} render={(i) => {
                return (
                  <button key={i.id} data-nav onFocus={() => setSel(i)} onMouseEnter={() => mode !== "tv" && setSel(i)} onClick={() => open(i, items)} {...liveRowMenu(i, mode, toggleFav)}
                    style={{ height: cellH * k }}
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface-2 p-2.5 pe-4 text-start">
                    <Logo item={i} className="aspect-video h-full shrink-0 rounded-xl bg-surface-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-muted-foreground">{i.num}</span>
                      <span className="flex items-center gap-2"><span dir="auto" className="block min-w-0 truncate text-base font-medium">{i.name}</span><SourceBadge item={i} dot /></span>
                    </span>
                    {isFav(i) && <Star className="size-5 shrink-0 fill-yellow-400 text-yellow-400" />}
                  </button>
                )
              }} />
          )
          // mobile: filters + now panel scroll with the grid, which starts under the top bar and runs under the bottom bar
          if (items.length) return grid(<div className="flex flex-col gap-3 pb-1">{head}</div>, "under-top")
          return (
            <div className="flex h-full flex-col gap-3">
              {head}
              <div className="min-h-0 flex-1">{items.length ? grid() : <Empty>{t("pages.live.none")}</Empty>}</div>
            </div>
          )
        })()
      )}
    </Shell>
  )
}
