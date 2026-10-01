import { Search as SearchIcon, X } from "lucide-react"
import { Empty, Shell } from "@/components/tv/ui"
import { isTv } from "@/lib/device"
import { useCatalog } from "@/lib/catalog"
import { useLibrary } from "@/layouts/hooks/use-library"
import { useSearch } from "@/layouts/hooks/use-search"
import { GRail } from "../parts"
import { Card, Pill } from "@/components/gtv"
import { SourceFilter } from "../source-ui"

/** Google TV Search: pill field on top, results as rails by type; recent titles when empty. */
export default function Search() {
  const { q, setQ, tooShort, results: res, live, movies, series, open } = useSearch()
  const lib = useLibrary()
  const { byKind } = useCatalog()
  return (
    <Shell page="search" title="Search">
      <div className="flex h-full flex-col gap-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
          <input data-nav aria-label="Search" autoFocus={!isTv} className="h-14 w-full rounded-full bg-surface-2 pl-14 pr-14 text-xl text-foreground outline-none placeholder:text-muted-foreground [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:appearance-none" type="search" enterKeyHint="search" autoComplete="off" placeholder={isTv ? "Search (press OK to type)" : "Search movies, shows and channels"} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && !isTv ? <button data-nav aria-label="Clear" onClick={() => setQ("")} className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-5" /></button> : null}
        </div>
        {/* TV: Left/Right move the caret while the field has text, so Clear sits below the field where Down reaches it */}
        {q && isTv && <Pill className="-mt-2 self-start" onClick={() => setQ("")}><X />Clear search</Pill>}
        <SourceFilter className="-mt-2" />
        <div className="min-h-0 flex-1">
          <div className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar">
            {res.length ? (
              <>
                {movies.length > 0 && <GRail title="Movies">{movies.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
                {series.length > 0 && <GRail title="Shows">{series.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
                {live.length > 0 && <GRail title="Live channels">{live.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i, live)} />)}</GRail>}
              </>
            ) : !tooShort ? <div className="h-48"><Empty>No results</Empty></div> : (
              <>
                <GRail title="Trending">{[...byKind.movie.slice(0, 8), ...byKind.series.slice(0, 8)].map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>
                {lib.history.length > 0 && <GRail title="Recently watched">{lib.history.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i)} />)}</GRail>}
                {lib.favorites.length > 0 && <GRail title="Your watchlist">{lib.favorites.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
                              </>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
