import { Empty, Shell } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useLibrary } from "../../hooks/use-library"
import { Grid, Row, SkelRows, SourceBar, Tile, usePlay, variantOf } from "../ui"

/** My List: grid of favorites, Continue Watching row above, Recently Watched below. */
export default function Library() {
  const L = useLibrary()
  const t = useT()
  const play = usePlay()
  const tile = (i: Parameters<typeof L.open>[0], v: "wide" | "poster", fluid?: boolean) => <Tile key={i.id} item={i} variant={v} fluid={fluid} pct={L.pct(i)} onOpen={() => L.open(i)} onPlay={() => play(i)} />
  return (
    <Shell page="library" title={t("nf.myList")}>
      {L.status !== "ready" ? <SkelRows /> : (
        <div className="nf-page">
          <div className="nf-strip flex flex-wrap items-center gap-3"><h1 className="nf-h1 me-auto">{t("nf.myList")}</h1>
            <button data-nav onClick={L.openHistory} className="rounded bg-white/10 px-4 py-2 text-sm font-semibold">{t("nf.library.history")}</button>
            <button data-nav onClick={L.openStats} className="rounded bg-white/10 px-4 py-2 text-sm font-semibold">{t("nf.library.stats")}</button>
          </div>
          <SourceBar />
          {L.continueWatching.length > 0 && <Row title={t("nf.library.continue")}>{L.continueWatching.map((i) => tile(i, i.kind === "live" ? "wide" : "poster"))}</Row>}
          {L.favorites.length ? <Grid variant={variantOf(L.favorites)}>{L.favorites.map((i) => tile(i, variantOf(L.favorites), true))}</Grid>
            : <div className="h-40"><Empty>{t("nf.library.empty")}</Empty></div>}
          {L.history.length > 0 && <Row title={t("nf.library.recent")}>{L.history.map((i) => tile(i, i.kind === "live" ? "wide" : "poster"))}</Row>}
        </div>
      )}
    </Shell>
  )
}
