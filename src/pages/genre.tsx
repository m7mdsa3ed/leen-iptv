import { ArrowLeft } from "lucide-react"
import { Card, Pill, RoundButton, SkelGrid } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { Empty, Pending, Shell, VGrid } from "@/components/tv/ui"
import { useGenre } from "@/layouts/hooks/use-genre"
import { isTv } from "@/lib/device"

/** A genre (Drama, Comedy...) as a page: popular titles of that genre from the metadata provider that exist in your catalog,
 *  plus any of your own categories named like it. Route id = `${kind}|${genre}`. */
export default function GenrePage({ id }: { id: string }) {
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, back, pct, open, openCategory, openSettings } = useGenre(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div className="flex h-full flex-col">
          <div className="m-rise flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
            <div className="mr-auto min-w-0">
              <h2 className="truncate text-3xl font-medium tracking-tight">{genre}</h2>
              <div className="text-sm text-muted-foreground">{available ? `${items.length} popular ${kind === "movie" ? "movies" : "series"} in your library` : "Genres come from TMDB"}</div>
            </div>
            {related.map((g) => <Pill key={g} onClick={() => openCategory(g)}>{g}</Pill>)}
            {available && hasMore && <Pill variant="primary" disabled={loading} onClick={() => void more()}>{loading ? "Searching..." : "Find more"}</Pill>}
          </div>
          <SourceFilter />
          <div className="m-fade min-h-0 flex-1" style={{ "--i": 1 } as React.CSSProperties}>
            {!available ? (
              <Empty>
                <div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center">
                  <p>Genre pages use TMDB to find popular {genre} titles. Add a free TMDB key to see them.</p>
                  <Pill variant="primary" data-autofocus="" onClick={() => openSettings()}>Open settings</Pill>
                </div>
              </Empty>
            ) : items.length ? (
              <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => void open(i)} />} />
            ) : loading ? (
              <SkelGrid />
            ) : (
              <Empty>{unknown ? `TMDB has no "${genre}" genre for ${kind === "movie" ? "movies" : "series"}.` : hasMore ? "None of the popular titles found yet." : "None of the popular titles in this genre are in your library."}</Empty>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}
