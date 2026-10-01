import { Play, Search as SearchIcon, X } from "lucide-react"
import { Logo, Shell } from "@/components/tv/ui"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useSearch } from "../../hooks/use-search"
import type { Item } from "@/lib/types"
import { Grid, SourceBar, Tile, useTopRated, usePlay } from "../ui"

/** Search: persistent input on top, results as tile grids by type, "Top Searches" list while empty. */
export default function Search() {
  const t = useT()
  const S = useSearch()
  const top = useTopRated(10)
  const play = usePlay()
  const sections: [string, Item[], "wide" | "poster"][] = [[t("nf.search.movies"), S.movies, "poster"], [t("nf.search.shows"), S.series, "poster"], [t("nf.search.live"), S.live, "wide"]]
  const empty = S.q.trim() === ""
  return (
    <Shell page="search" title={t("nf.search.title")}>
      <div className="nf-page">
        <div className="pt-4">
          <label className="nf-search">
            <SearchIcon className="size-6 shrink-0 text-muted-foreground" />
            <input data-nav dir="auto" autoFocus={!isTv} type="search" enterKeyHint="search" autoComplete="off" value={S.q} onChange={(e) => S.setQ(e.target.value)} placeholder={isTv ? t("nf.search.placeholderTv") : t("nf.search.placeholder")} className="[&::-webkit-search-cancel-button]:appearance-none" />
            {S.q && !isTv && <button type="button" data-nav aria-label={t("nf.search.clear")} onClick={() => S.setQ("")} className="nf-hbtn"><X className="size-5" /></button>}
          </label>
        </div>
        <div className="pt-3"><SourceBar /></div>
        {S.results.length > 0 ? (
          sections.filter(([, l]) => l.length).map(([name, l, v]) => (
            <section key={name} className="mt-4">
              <h2 className="nf-rowtitle !px-0">{name}</h2>
              <Grid variant={v}>{l.map((i) => <Tile key={i.id} item={i} variant={v} fluid onOpen={() => S.open(i, S.live)} onPlay={() => play(i, S.live)} />)}</Grid>
            </section>
          ))
        ) : empty ? (
          top.length > 0 && (
            <section className="mt-6 pb-24">
              <h2 className="nf-rowtitle !px-0 mb-2">{t("nf.search.top")}</h2>
              <div data-nav-group>
                {top.map((i) => (
                  <button key={i.id} data-nav onClick={() => S.open(i)} className="nf-top-search">
                    <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-sm bg-surface-3 md:w-36"><Logo item={{ ...i, logo: i.backdrop ?? i.logo }} className="size-full object-cover" /></span>
                    <span dir="auto" className="min-w-0 flex-1 truncate text-lg font-semibold">{i.name}</span>
                    <span className="nf-circle shrink-0"><Play className="size-5 fill-current" /></span>
                  </button>
                ))}
              </div>
            </section>
          )
        ) : (
          <div className="py-20 text-center text-lg text-muted-foreground">{S.tooShort ? t("nf.search.tooShort") : t("nf.search.noMatch", { q: S.q.trim() })}</div>
        )}
      </div>
    </Shell>
  )
}
