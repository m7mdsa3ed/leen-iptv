import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { fmt, useT } from "@/lib/i18n"
import { Empty, Shell } from "@/components/tv/ui"
import { SkelGrid } from "@/components/gtv"
import { useCatalogView } from "../../hooks/use-source-filter"
import { useLibrary } from "../../hooks/use-library"
import type { Item } from "@/lib/types"
import { Capsule, SourceFilter, Tile } from "../ui"

/** Library: split screen. Left = collections, right = what is in the focused one (poster grid, or the source list). */
export default function Library() {
  const t = useT()
  const L = useLibrary()
  const { byKind } = useCatalogView()
  const [sel, setSel] = useState("")
  const cols = useMemo(() => {
    // ponytail: the catalog has no "added" date; newest = last in provider order
    const recent = [...byKind.movie.slice(-30), ...byKind.series.slice(-30)].reverse()
    return [
      { id: "recent", name: t("atv.library.recentlyAdded"), items: recent },
      { id: "movies", name: t("atv.library.movies"), items: byKind.movie },
      { id: "shows", name: t("atv.library.shows"), items: byKind.series },
      { id: "watchlist", name: t("atv.library.watchlist"), items: [...L.continueWatching, ...L.favorites].filter((i, n, a) => a.findIndex((x) => x.id === i.id) === n) },
      { id: "watched", name: t("atv.library.recentlyWatched"), items: L.history },
      { id: "live", name: t("atv.library.live"), items: byKind.live },
      { id: "sources", name: t("atv.library.sources"), items: [] as Item[] },
    ]
  }, [byKind, L.continueWatching, L.favorites, L.history, t])
  const cur = cols.find((c) => c.id === sel) ?? cols.find((c) => c.items.length) ?? cols[0]
  const wide = cur.id === "live" || cur.id === "watched"
  return (
    <Shell page="library" title={t("atv.library.title")}>
      <div className="atv-split h-full gap-8 pt-4 md:flex">
        <nav data-nav-group="memory" aria-label={t("atv.library.collections")} className="atv-colnav no-scrollbar flex shrink-0 gap-2 overflow-x-auto p-1 md:w-[17rem] md:flex-col md:overflow-y-auto md:overflow-x-visible">
          <h1 className="atv-h1 mb-2 hidden px-4 text-[2.5rem] md:block">{t("atv.library.title")}</h1>
          {cols.map((c) => (
            <button key={c.id} data-nav data-pill aria-current={c.id === cur.id ? "true" : undefined} onFocus={() => setSel(c.id)} onClick={() => setSel(c.id)}
              className="atv-row flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-start text-lg font-semibold">
              <span className="truncate">{c.name}</span>
              <span className="text-sm font-normal text-muted-foreground">{fmt.number(c.id === "sources" ? L.sources.length : c.items.length)}</span>
            </button>
          ))}
          {([[t("atv.library.history"), L.openHistory], [t("atv.library.stats"), L.openStats]] as const).map(([name, go]) => (
            <button key={name} data-nav data-pill onClick={go} className="atv-row flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-start text-lg font-semibold"><span className="truncate">{name}</span></button>
          ))}
        </nav>
        <section aria-label={cur.name} className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto pt-2 md:-me-[var(--gx)] md:pe-[var(--gx)]">
          <h2 className="atv-shelf-title mb-2 px-1">{cur.name}</h2>
          {cur.id !== "sources" && <SourceFilter className="mb-1" />}
          {L.status !== "ready" ? <SkelGrid /> : cur.id === "sources" ? (
            <div className="flex max-w-2xl flex-col gap-3 px-3 py-1">
              {L.sources.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Capsule primary={s.id === L.sourceId} className={cn("min-w-0 flex-1 !justify-start", s.id !== L.sourceId && "atv-glass")} onClick={() => L.setSource(s.id)}><span dir="auto" className="truncate">{s.name}</span><span className="text-sm font-normal opacity-70">{s.type}</span></Capsule>
                </div>
              ))}
              <Capsule onClick={L.addSource} className="self-start"><Plus />{t("atv.library.addSource")}</Capsule>
            </div>
          ) : cur.items.length ? (
            <div className={cn("atv-grid atv-grid-lib pb-6 pt-4", wide && "atv-grid-wide")}>
              {cur.items.slice(0, 120).map((i) => <Tile key={i.id} item={i} shape={wide || i.kind === "live" ? "wide" : "poster"} size="fluid" pct={L.pct(i)} always={wide} sub={wide ? i.group : undefined} onOpen={() => L.open(i)} />)}
            </div>
          ) : <div className="h-60"><Empty>{t("atv.library.empty")}</Empty></div>}
        </section>
      </div>
    </Shell>
  )
}
