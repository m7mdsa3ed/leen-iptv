import { Star } from "lucide-react"
import { GroupList } from "@/components/tv/groups"
import { SourceFilter } from "@/components/source/SourceFilter"
import { SourceBadge } from "@/components/source/SourceBadge"
import { Empty, Logo, Shell, VGrid, Pending, useK } from "@/components/tv/ui"
import { progressPct as pct, useLive } from "@/layouts/hooks/use-live"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { KEY } from "@/lib/nav"

export default function Live() {
  const { groups, status, g, setG, items, sel, setSel, now, next, nowOf, isFav, toggleFav, open } = useLive()
  const mode = useMode()
  const t = useT()
  const hm = (n: number) => fmt.time(n)
  const k = useK()
  const cellH = 84

  return (
    <Shell page="live" title={t("pages.live.title")}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex h-full flex-col gap-3">
          <SourceFilter />
          <GroupList kind="live" groups={groups} active={g} onPick={setG} />
          <div className="flex min-h-[5.5rem] shrink-0 items-center gap-4 rounded-3xl bg-surface p-3 pe-5">
            {sel ? (
              <>
                <Logo item={sel} className="size-16 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-medium"><span className="me-2 text-muted-foreground"><bdi dir="ltr">{sel.num}</bdi></span><span dir="auto">{sel.name}</span><SourceBadge item={sel} className="ms-2 align-middle" /></div>
                  {now ? (
                    <>
                      <div className="truncate text-base"><span dir="auto">{now.t}</span> <span className="text-muted-foreground"><bdi dir="ltr">{hm(now.s)} - {hm(now.e)}</bdi>{next ? <> · <bdi dir="auto">{t("pages.live.next", { time: hm(next.s), title: next.t })}</bdi></> : null}</span></div>
                      <div dir="ltr" className="mt-1 h-1 rounded-full bg-foreground/15"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${pct(now.s, now.e)}%` }} /></div>
                      {now.d && mode !== "mobile" && <p dir="auto" className="mt-1 line-clamp-1 text-sm text-muted-foreground">{now.d}</p>}
                    </>
                  ) : <div className="text-base text-muted-foreground">{t("pages.live.noGuide")}</div>}
                </div>
              </>
            ) : <div className="px-2 text-muted-foreground">{mode === "tv" ? t("pages.live.selectTv") : t("pages.live.select")}</div>}
          </div>
          <div className="min-h-0 flex-1">
            {items.length ? (
              <VGrid items={items} ratio={0} label={cellH} minW={mode === "tv" ? 340 : 280} render={(i) => {
                const n = nowOf(i).now
                return (
                  <button key={i.id} data-nav onFocus={() => setSel(i)} onMouseEnter={() => mode !== "tv" && setSel(i)} onClick={() => open(i, items)} onKeyDown={(e) => e.keyCode === KEY.red && toggleFav(i)} onContextMenu={(e) => { if (mode !== "tv") { e.preventDefault(); toggleFav(i) } }}
                    style={{ height: cellH * k }}
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface-2 p-2.5 pe-4 text-start">
                    <Logo item={i} className="aspect-video h-full shrink-0 rounded-xl bg-surface-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-muted-foreground">{i.num}</span>
                      <span className="flex items-center gap-2"><span dir="auto" className="block min-w-0 truncate text-base font-medium">{i.name}</span><SourceBadge item={i} dot /></span>
                      <span dir="auto" className="block truncate text-sm text-muted-foreground">{n ? n.t : t("pages.live.noGuide")}</span>
                      {n && <span dir="ltr" className="mt-1 block h-1 rounded-full bg-foreground/15"><span className="block h-full rounded-full bg-accent-blue" style={{ width: `${pct(n.s, n.e)}%` }} /></span>}
                    </span>
                    {isFav(i) && <Star className="size-5 shrink-0 fill-yellow-400 text-yellow-400" />}
                  </button>
                )
              }} />
            ) : <Empty>{t("pages.live.none")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
