import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Empty, Shell } from "@/components/tv/ui"
import { SkelGrid } from "@/components/gtv"
import { useCatalog } from "@/lib/catalog"
import { useLibrary } from "../../hooks/use-library"
import type { Item } from "@/lib/types"
import { Capsule, Tile } from "../ui"

/** Library: split screen. Left = collections, right = what is in the focused one (poster grid, or the source list). */
export default function Library() {
  const L = useLibrary()
  const byKind = useCatalog((s) => s.byKind)
  const [sel, setSel] = useState("")
  const cols = useMemo(() => {
    // ponytail: the catalog has no "added" date; newest = last in provider order
    const recent = [...byKind.movie.slice(-30), ...byKind.series.slice(-30)].reverse()
    return [
      { name: "Recently Added", items: recent },
      { name: "Movies", items: byKind.movie },
      { name: "Shows", items: byKind.series },
      { name: "Watchlist", items: [...L.continueWatching, ...L.favorites].filter((i, n, a) => a.findIndex((x) => x.id === i.id) === n) },
      { name: "Recently Watched", items: L.history },
      { name: "Live channels", items: byKind.live },
      { name: "Sources", items: [] as Item[] },
    ]
  }, [byKind, L.continueWatching, L.favorites, L.history])
  const cur = cols.find((c) => c.name === sel) ?? cols.find((c) => c.items.length) ?? cols[0]
  const wide = cur.name === "Live channels" || cur.name === "Recently Watched"
  return (
    <Shell page="library" title="Library">
      <div className="atv-split h-full gap-8 pt-4 md:flex">
        <nav data-nav-group="memory" aria-label="Collections" className="atv-colnav no-scrollbar flex shrink-0 gap-2 overflow-x-auto p-1 md:w-[17rem] md:flex-col md:overflow-y-auto md:overflow-x-visible">
          <h1 className="atv-h1 mb-2 hidden px-4 text-[2.5rem] md:block">Library</h1>
          {cols.map((c) => (
            <button key={c.name} data-nav data-pill aria-current={c.name === cur.name ? "true" : undefined} onFocus={() => setSel(c.name)} onClick={() => setSel(c.name)}
              className="atv-row flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left text-lg font-semibold">
              <span className="truncate">{c.name}</span>
              <span className="text-sm font-normal text-muted-foreground">{c.name === "Sources" ? L.sources.length : c.items.length}</span>
            </button>
          ))}
          {([["History", L.openHistory], ["Stats", L.openStats]] as const).map(([name, go]) => (
            <button key={name} data-nav data-pill onClick={go} className="atv-row flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-2xl px-4 py-2 text-left text-lg font-semibold"><span className="truncate">{name}</span></button>
          ))}
        </nav>
        <section aria-label={cur.name} className="no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto pt-2 md:-mr-[var(--gx)] md:pr-[var(--gx)]">
          <h2 className="atv-shelf-title mb-2 px-1">{cur.name}</h2>
          {L.status !== "ready" ? <SkelGrid /> : cur.name === "Sources" ? (
            <div className="flex max-w-2xl flex-col gap-3 px-3 py-1">
              {L.sources.map((s) => (
                <div key={s.id} className="flex items-center gap-3">
                  <Capsule primary={s.id === L.sourceId} className={cn("min-w-0 flex-1 !justify-start", s.id !== L.sourceId && "atv-glass")} onClick={() => L.setSource(s.id)}><span className="truncate">{s.name}</span><span className="text-sm font-normal opacity-70">{s.type}</span></Capsule>
                </div>
              ))}
              <Capsule onClick={L.addSource} className="self-start"><Plus />Add source</Capsule>
            </div>
          ) : cur.items.length ? (
            <div className={cn("atv-grid atv-grid-lib pb-6 pt-4", wide && "atv-grid-wide")}>
              {cur.items.slice(0, 120).map((i) => <Tile key={i.id} item={i} shape={wide || i.kind === "live" ? "wide" : "poster"} size="fluid" pct={L.pct(i)} always={wide} sub={wide ? i.group : undefined} onOpen={() => L.open(i)} />)}
            </div>
          ) : <div className="h-60"><Empty>Nothing here yet. Add titles to Up Next or start watching.</Empty></div>}
        </section>
      </div>
    </Shell>
  )
}
