import { useMemo, useRef } from "react"
import { Shell, TvButton, Empty } from "@/components/tv/ui"
import { SkelRail } from "@/components/gtv"
import type { Item } from "@/lib/types"
import { usePData } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { Hero, Shelf, SkelHeroBlock, Tile } from "./ui"

const rate = (i: Item) => parseFloat(i.rating ?? "") || 0
const uniq = (l: Item[]) => l.filter((i, n) => l.findIndex((x) => x.id === i.id) === n)

/** Watch Now: full-bleed carousel, then Up Next, What to Watch, Live, Top Movies, Top Shows and category shelves. */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const prog = usePData().progress
  const left = (i: Item) => { const p = prog[i.id]; const m = p && p.dur > p.pos ? Math.ceil((p.dur - p.pos) / 60) : 0; return m ? fmt.plural("atv.home.minLeft", m) : i.group }
  const what = (i: Item) => [i.year && fmt.digits(i.year), i.genres?.[0] ?? i.group].filter(Boolean).join("  ·  ")
  const scroller = useRef<HTMLDivElement>(null)
  const s = useMemo(() => {
    const by = (k: string) => h.rails.find((r) => r.key === k)
    const cont = by("cont"), live = by("live")
    const genre = h.rails.filter((r) => r.kind === "poster")
    const top = (kind: string) => uniq(genre.filter((r) => r.key.startsWith(kind)).flatMap((r) => r.items)).sort((a, b) => rate(b) - rate(a)).slice(0, 20)
    return {
      cont, live, genre,
      upNext: uniq([...(cont?.items ?? []), ...(by("favs")?.items ?? [])]),
      recents: by("recents"),
      what: uniq(genre.map((r) => r.items[0])).slice(0, 12),
      movies: top("movie"), shows: top("series"),
    }
  }, [h.rails])
  return (
    <Shell page="home" title={h.sourceName ?? t("atv.home.watchNow")}>
      {h.status === "loading" && (
        <div role="status" className="atv-scroll overflow-hidden">
          <SkelHeroBlock />
          <div className="mb-2 mt-3 text-base text-muted-foreground">{h.msg}...</div>
          <SkelRail variant="wide" />
          <SkelRail />
        </div>
      )}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("common.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("atv.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div ref={scroller} data-nav-group className="atv-scroll overflow-y-auto">
          {h.featured.length ? (
            <div className="contents" onFocus={() => scroller.current?.scrollTo({ top: 0 })}>
              <Hero picks={h.featured} onPlay={h.play} onInfo={h.info} isFav={h.isFav} onFav={h.toggleFav} />
            </div>
          ) : <div className="h-[calc(var(--hdr)+1rem)]"><Empty>{t("atv.home.pick")}</Empty></div>}
          <div className="atv-after-hero">
            {s.upNext.length > 0 && (
              <Shelf title={t("atv.home.upNext")}>
                {s.upNext.map((i) => <Tile key={i.id} item={i} {...(i.kind === "live" ? {} : { shape: "poster" as const, size: "poster" as const })} pct={s.cont?.pct?.(i)} sub={left(i)} onOpen={() => h.open(i)} />)}
              </Shelf>
            )}
            {s.what.length > 0 && (
              <Shelf title={t("atv.home.whatToWatch")}>
                {s.what.map((i) => <Tile key={i.id} item={i} size="big" sub={what(i)} onOpen={() => h.open(i)} />)}
              </Shelf>
            )}
            {s.live && (
              <Shelf title={t("atv.home.liveNow")}>
                {s.live.items.map((i) => <Tile key={i.id} item={i} sub={s.live!.sub?.(i)} always onOpen={() => h.open(i, s.live!.items)} />)}
              </Shelf>
            )}
            {s.movies.length > 0 && (
              <Shelf title={t("atv.home.topMovies")}>
                {s.movies.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => h.open(i)} />)}
              </Shelf>
            )}
            {s.shows.length > 0 && (
              <Shelf title={t("atv.home.topShows")}>
                {s.shows.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => h.open(i)} />)}
              </Shelf>
            )}
            {s.recents && (
              <Shelf title={t("atv.home.recentlyWatched")}>
                {s.recents.items.map((i) => <Tile key={i.id} item={i} sub={i.group} onOpen={() => h.open(i)} />)}
              </Shelf>
            )}
            {s.genre.map((r) => (
              <Shelf key={r.key} title={r.title} onTitle={r.seeAll}>
                {r.items.map((i) => <Tile key={i.id} item={i} shape="poster" size="poster" onOpen={() => h.open(i)} />)}
              </Shelf>
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}
