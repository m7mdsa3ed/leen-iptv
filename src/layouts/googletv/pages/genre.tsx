import { ArrowLeft } from "lucide-react"
import { Card, Pill, RoundButton, SkelGrid } from "@/components/gtv"
import { Empty, Pending, Shell, VGrid } from "@/components/tv/ui"
import { useGenre } from "@/layouts/hooks/use-genre"
import { SourceFilter } from "../source-ui"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"

/** A genre (Drama, Comedy...) as a page: popular titles of that genre from the metadata provider that exist in your catalog,
 *  plus any of your own categories named like it. Route id = `${kind}|${genre}`. */
export default function GenrePage({ id }: { id: string }) {
  const t = useT()
  const { kind, genre, status, items, available, loading, unknown, hasMore, more, related, back, pct, open, openCategory, openSettings } = useGenre(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={genre}>
      {status !== "ready" ? <Pending /> : (
        (() => {
          const head = (<>
          <div className="m-rise flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label={t("gtv.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
            <div className="me-auto min-w-0">
              <h2 dir="auto" className="truncate text-[1.4rem] font-normal">{genre}</h2>
              <div className="text-sm text-muted-foreground">{available ? fmt.plural(kind === "movie" ? "gtv.genre.countMovies" : "gtv.genre.countSeries", items.length) : t("gtv.genre.fromTmdb")}</div>
            </div>
            {related.map((g) => <Pill key={g} onClick={() => openCategory(g)}>{g}</Pill>)}
            {available && hasMore && <Pill variant="primary" disabled={loading} onClick={() => void more()}>{loading ? t("gtv.genre.searching") : t("gtv.genre.findMore")}</Pill>}
          </div>
          <SourceFilter />
          </>)
          if (available && items.length) return <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => void open(i)} />} head={head} className="-mt-[var(--hdr)] pt-[var(--hdr)] [--up:var(--hdr)]" />
          return (
            <div className="flex h-full flex-col">
              {head}
              <div className="m-fade min-h-0 flex-1" style={{ "--i": 1 } as React.CSSProperties}>
            {!available ? (
              <Empty>
                <div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center">
                  <p>{t("gtv.genre.needKey", { genre })}</p>
                  <Pill variant="primary" data-autofocus="" onClick={() => openSettings()}>{t("gtv.genre.openSettings")}</Pill>
                </div>
              </Empty>
                        ) : loading ? (
              <SkelGrid />
            ) : (
              <Empty>{unknown ? t(kind === "movie" ? "gtv.genre.unknownMovie" : "gtv.genre.unknownSeries", { genre }) : hasMore ? t("gtv.genre.noneYet") : t("gtv.genre.noneInLibrary")}</Empty>
            )}
              </div>
            </div>
          )
        })()
      )}
    </Shell>
  )
}
