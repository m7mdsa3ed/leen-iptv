import { Empty, Pending, Shell } from "@/components/tv/ui"
import { SkelGrid } from "@/components/gtv"
import { useGenre } from "../../hooks/use-genre"
import { Capsule, SourceFilter, Tile } from "../ui"

/** One genre: title, related category capsules, poster grid of popular titles found in the catalog. */
export default function Genre({ id }: { id: string }) {
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, pct, open, openCategory, openSettings } = useGenre(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div data-nav-group className="no-scrollbar h-full overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3 pb-1 pt-4">
            <h1 className="atv-h1 mr-auto min-w-0 truncate text-[2.5rem]">{genre}</h1>
            {related.map((g) => <Capsule key={g} className="!min-h-11 !px-6 !text-base" onClick={() => openCategory(g)}>{g}</Capsule>)}
            {available && hasMore && <Capsule primary aria-disabled={loading} className="!min-h-11 !px-6 !text-base aria-disabled:opacity-50" onClick={() => { if (!loading) void more() }}>{loading ? "Searching..." : "Find more"}</Capsule>}
          </div>
          <SourceFilter className="mt-2" />
          {!available ? (
            <div className="flex max-w-xl flex-col items-start gap-4 pt-6 text-lg text-muted-foreground">
              <p>Genre pages use TMDB to find popular {genre} titles. Add a free TMDB key to see them.</p>
              <Capsule primary data-autofocus="" onClick={() => openSettings()}>Open settings</Capsule>
            </div>
          ) : items.length ? (
            <div className="atv-grid pt-4">{items.map((i) => <Tile key={i.id} item={i} shape="poster" size="fluid" pct={pct(i)} always onOpen={() => void open(i)} />)}</div>
          ) : loading ? <SkelGrid /> : (
            <div className="h-48"><Empty>{unknown ? `TMDB has no "${genre}" genre for ${kind === "movie" ? "movies" : "series"}.` : hasMore ? "None of the popular titles found yet." : "None of the popular titles in this genre are in your library."}</Empty></div>
          )}
        </div>
      )}
    </Shell>
  )
}
