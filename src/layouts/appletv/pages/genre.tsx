import { Empty, Pending, Shell } from "@/components/tv/ui"
import { SkelGrid } from "@/components/gtv"
import { useGenre } from "../../hooks/use-genre"
import { useT } from "@/lib/i18n"
import { Capsule, SourceFilter, Tile } from "../ui"

/** One genre: title, related category capsules, poster grid of popular titles found in the catalog. */
export default function Genre({ id }: { id: string }) {
  const t = useT()
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, pct, open, openCategory, openSettings } = useGenre(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        <div data-nav-group className="no-scrollbar h-full overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3 pb-1 pt-4">
            <h1 dir="auto" className="atv-h1 me-auto min-w-0 truncate text-[2.5rem]">{genre}</h1>
            {related.map((g) => <Capsule key={g} className="!min-h-11 !px-6 !text-base" onClick={() => openCategory(g)}>{g}</Capsule>)}
            {available && hasMore && <Capsule primary aria-disabled={loading} className="!min-h-11 !px-6 !text-base aria-disabled:opacity-50" onClick={() => { if (!loading) void more() }}>{loading ? t("atv.genre.searching") : t("atv.genre.findMore")}</Capsule>}
          </div>
          <SourceFilter className="mt-2" />
          {!available ? (
            <div className="flex max-w-xl flex-col items-start gap-4 pt-6 text-lg text-muted-foreground">
              <p>{t("atv.genre.needsTmdb", { genre })}</p>
              <Capsule primary data-autofocus="" onClick={() => openSettings()}>{t("atv.genre.openSettings")}</Capsule>
            </div>
          ) : items.length ? (
            <div className="atv-grid pt-4">{items.map((i) => <Tile key={i.id} item={i} shape="poster" size="fluid" pct={pct(i)} always onOpen={() => void open(i)} />)}</div>
          ) : loading ? <SkelGrid /> : (
            <div className="h-48"><Empty>{unknown ? t(kind === "movie" ? "atv.genre.unknownMovie" : "atv.genre.unknownSeries", { genre }) : hasMore ? t("atv.genre.noneYet") : t("atv.genre.noneInLibrary")}</Empty></div>
          )}
        </div>
      )}
    </Shell>
  )
}
