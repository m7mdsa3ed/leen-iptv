import { ArrowLeft } from "lucide-react"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useGenre } from "@/layouts/hooks/use-genre"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { PagedGrid, SkelRows, SourceBar, Tile, usePlay } from "../ui"

/** Genre page, Netflix style: title strip over a poster grid (TMDB-backed, same data as the shared page). Route id = `${kind}|${genre}`. */
export default function GenrePage({ id }: { id: string }) {
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, back, pct, open, openCategory, openSettings } = useGenre(id)
  const t = useT()
  const play = usePlay()
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div className="nf-page">
          <div className="nf-strip">
            {!isTv && <button data-nav aria-label={t("nf.genre.back")} onClick={back} className="nf-hbtn"><ArrowLeft className="rtl-flip size-6" /></button>}
            <h1 dir="auto" className="nf-h1">{genre}</h1>
            {related.map((g) => <button key={g} data-nav onClick={() => openCategory(g)} className="nf-drop"><span dir="auto">{g}</span></button>)}
            {available && hasMore && <button data-nav aria-disabled={loading} onClick={() => { if (!loading) void more() }} className="nf-drop aria-disabled:opacity-50">{loading ? t("nf.genre.searching") : t("nf.genre.findMore")}</button>}
          </div>
          <SourceBar />
          {!available ? (
            <div className="h-64"><Empty><div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center"><p>{t("nf.genre.needsTmdb", { genre })}</p><button data-nav data-autofocus="" onClick={() => openSettings()} className="nf-btn nf-play">{t("nf.genre.openSettings")}</button></div></Empty></div>
          ) : items.length ? (
            <PagedGrid variant="poster" items={items} render={(i) => <Tile key={i.id} item={i} variant="poster" fluid pct={pct(i)} onOpen={() => void open(i)} onPlay={() => play(i)} />} />
          ) : loading ? <SkelRows n={2} /> : (
            <div className="h-64"><Empty>{unknown ? t(kind === "movie" ? "nf.genre.unknownMovies" : "nf.genre.unknownSeries", { genre }) : hasMore ? t("nf.genre.noneYet") : t("nf.genre.noneInLibrary")}</Empty></div>
          )}
        </div>
      )}
    </Shell>
  )
}
