import { useMemo } from "react"
import { Search as SearchIcon, X } from "lucide-react"
import { Empty, Shell } from "@/components/tv/ui"
import { useCatalogView } from "../../hooks/use-source-filter"
import { isTv } from "@/lib/device"
import { useSearch } from "../../hooks/use-search"
import { Shelf, SourceFilter, Tile } from "../ui"

/** Search: big centred field, results as shelves by type; "Top Searches" (best rated titles) while empty. */
export default function Search() {
  const S = useSearch()
  const { byKind } = useCatalogView()
  const top = useMemo(() => [...byKind.movie, ...byKind.series].filter((i) => parseFloat(i.rating ?? "") > 0).sort((a, b) => parseFloat(b.rating!) - parseFloat(a.rating!)).slice(0, 10), [byKind])
  return (
    <Shell page="search" title="Search">
      <div className="flex h-full flex-col gap-4">
        <div className="relative mx-auto w-full max-w-3xl pt-2">
          <SearchIcon className="pointer-events-none absolute left-6 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
          <input data-nav autoFocus={!isTv} type="search" enterKeyHint="search" autoComplete="off" value={S.q} onChange={(e) => S.setQ(e.target.value)}
            placeholder={isTv ? "Shows, Movies, Channels (press OK to type)" : "Shows, Movies, Channels"}
            className="atv-search h-14 w-full rounded-full pl-16 pr-14 text-xl text-foreground outline-none placeholder:text-muted-foreground md:h-16 md:text-2xl [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:appearance-none" />
          {S.q && !isTv && <button aria-label="Clear" onClick={() => S.setQ("")} className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-5" /></button>}
        </div>
        <SourceFilter className="mx-auto max-w-full" />
        <div className="min-h-0 flex-1">
          {S.results.length ? (
            <div data-nav-group className="atv-scroll !mt-0 !h-full overflow-y-auto">
              {S.live.length > 0 && <Shelf title="Live">{S.live.map((i) => <Tile key={i.id} item={i} always onOpen={() => S.open(i, S.live)} />)}</Shelf>}
              {S.movies.length > 0 && <Shelf title="Movies">{S.movies.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => S.open(i)} />)}</Shelf>}
              {S.series.length > 0 && <Shelf title="Shows">{S.series.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => S.open(i)} />)}</Shelf>}
            </div>
          ) : S.tooShort && top.length ? (
            <div className="mx-auto max-w-3xl overflow-y-auto pt-4">
              <h2 className="atv-shelf-title mb-2">Top Searches</h2>
              <ul data-nav-group>
                {top.map((i) => (
                  <li key={i.id}><button data-nav data-pill onClick={() => S.setQ(i.name)} className="atv-row flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2 text-left text-xl">
                    <SearchIcon className="size-5 shrink-0 text-muted-foreground" /><span className="truncate">{i.name}</span>
                  </button></li>
                ))}
              </ul>
            </div>
          ) : <Empty>{S.tooShort ? "Type at least 2 letters" : "No results"}</Empty>}
        </div>
      </div>
    </Shell>
  )
}
