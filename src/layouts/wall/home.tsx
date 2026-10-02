import { useMemo } from "react"
import { Empty, Pending, Shell, TvButton } from "@/components/tv/ui"
import { Card } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { useCatalogView } from "../hooks/use-source-filter"
import { Fanart, Hub, InfoBar, useFollow, useSeed } from "./parts"

/** Plex home: fanart + inline info for the focused title, then hubs (Continue Watching, Recently Added movies / shows, favorites, ...). */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const { byKind } = useCatalogView()
  const follow = useFollow()
  // newest additions (catalog order, last = newest)
  const addedMovies = useMemo(() => byKind.movie.slice(-20).reverse(), [byKind])
  const addedShows = useMemo(() => byKind.series.slice(-20).reverse(), [byKind])
  const cont = h.rails.find((r) => r.key === "cont")
  const rest = h.rails.filter((r) => r.key !== "cont")
  useSeed(cont?.items.length ? cont.items : addedMovies.length ? addedMovies : addedShows)
  const open = (i: Parameters<typeof h.open>[0], l: Parameters<typeof h.open>[1]) => () => h.open(i, l)
  const posters = (l: typeof addedMovies) => l.map((i) => <Card key={i.id} item={i} onOpen={open(i, l)} />)
  return (
    <Shell page="home" title={h.sourceName ?? t("pw.home.title")}>
      {h.status === "loading" && <Pending />}
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("pw.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("pw.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status === "ready" && (
        <div className="relative -mx-[var(--gx)] h-full">
          <Fanart />
          <div onFocus={follow} className="pw-scroll relative h-full overflow-y-auto px-[var(--gx)] [scroll-padding-block:6rem]">
            <InfoBar onPlay={h.play} />
            <div className="mb-2"><SourceFilter /></div>
            {cont && <Hub title={cont.title}>{cont.items.map((i) => <Card key={i.id} item={i} variant={cont.card ?? cont.kind} pct={cont.pct?.(i)} sub={cont.sub?.(i)} onOpen={open(i, cont.items)} />)}</Hub>}
            {addedMovies.length > 0 && <Hub title={t("pw.hub.addedMovies")}>{posters(addedMovies)}</Hub>}
            {addedShows.length > 0 && <Hub title={t("pw.hub.addedShows")}>{posters(addedShows)}</Hub>}
            {rest.map((r) => (
              <Hub key={r.key} title={r.title} onSeeAll={r.seeAll}>
                {r.items.map((i) => <Card key={i.id} item={i} variant={r.card ?? r.kind} pct={r.pct?.(i)} sub={r.sub?.(i)} onOpen={open(i, r.items)} />)}
              </Hub>
            ))}
            {!cont && !addedMovies.length && !addedShows.length && !rest.length && <Empty>{t("pw.home.empty")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
