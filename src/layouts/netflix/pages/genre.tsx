import { ArrowLeft } from "lucide-react"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useGenre } from "@/layouts/hooks/use-genre"
import { isTv } from "@/lib/device"
import { PagedGrid, SkelRows, SourceBar, Tile, usePlay } from "../ui"

/** Genre page, Netflix style: title strip over a poster grid (TMDB-backed, same data as the shared page). Route id = `${kind}|${genre}`. */
export default function GenrePage({ id }: { id: string }) {
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, back, pct, open, openCategory, openSettings } = useGenre(id)
  const play = usePlay()
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div className="nf-page">
          <div className="nf-strip">
            {!isTv && <button data-nav aria-label="Back" onClick={back} className="nf-hbtn"><ArrowLeft className="size-6" /></button>}
            <h1 className="nf-h1">{genre}</h1>
            {related.map((g) => <button key={g} data-nav onClick={() => openCategory(g)} className="nf-drop">{g}</button>)}
            {available && hasMore && <button data-nav aria-disabled={loading} onClick={() => { if (!loading) void more() }} className="nf-drop aria-disabled:opacity-50">{loading ? "Searching..." : "Find more"}</button>}
          </div>
          <SourceBar />
          {!available ? (
            <div className="h-64"><Empty><div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center"><p>Genre pages use TMDB to find popular {genre} titles. Add a free TMDB key to see them.</p><button data-nav data-autofocus="" onClick={() => openSettings()} className="nf-btn nf-play">Open settings</button></div></Empty></div>
          ) : items.length ? (
            <PagedGrid variant="poster" items={items} render={(i) => <Tile key={i.id} item={i} variant="poster" fluid pct={pct(i)} onOpen={() => void open(i)} onPlay={() => play(i)} />} />
          ) : loading ? <SkelRows n={2} /> : (
            <div className="h-64"><Empty>{unknown ? `TMDB has no "${genre}" genre for ${kind === "movie" ? "movies" : "series"}.` : hasMore ? "None of the popular titles found yet." : "None of the popular titles in this genre are in your library."}</Empty></div>
          )}
        </div>
      )}
    </Shell>
  )
}
