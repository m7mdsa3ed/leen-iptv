import { useMemo, useState } from "react"
import { Chips, Pending, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { ALL, FAV, useBrowse } from "../../hooks/use-browse"
import { useCatalogView } from "../../hooks/use-source-filter"
import { fmt, useT } from "@/lib/i18n"
import type { Kind } from "@/lib/types"
import { Opt, PosterGrid } from "../parts"

type Sort = "default" | "az" | "rating"
const SORTS: Sort[] = ["default", "az", "rating"]
const num = (r?: string) => parseFloat(r ?? "") || 0

/** Plex library: title + count, Library / Genres tabs, filter + sort toolbar, rounded poster grid. */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const { byKind } = useCatalogView()
  const [c, setC] = useState(ALL)
  const [by, setBy] = useState<"cat" | "genre">("cat")
  const [sort, setSort] = useState<Sort>("default")
  const items = useMemo(() => {
    const l = c === FAV ? B.favorites : c === ALL ? byKind[kind] : byKind[kind].filter((i) => i.group === c)
    if (sort === "az") return [...l].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }))
    if (sort === "rating") return [...l].sort((a, b) => num(b.rating) - num(a.rating))
    return l
  }, [c, sort, byKind, kind, B.favorites])
  return (
    <Shell page={B.page} title={B.kindLabel}>
      {B.status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex h-full flex-col pt-5">
          <div className="pw-bar">
            <div className="flex flex-wrap items-baseline gap-x-4">
              <h2 className="pw-page-title">{B.kindLabel}</h2>
              <span className="text-base text-muted-foreground tabular-nums">{t("pw.browse.count", { n: fmt.number(items.length) })}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {B.genres.length > 0 && (
                <div data-nav-group className="flex items-center gap-2">
                  <Opt on={by === "cat"} onClick={() => setBy("cat")}>{t("pw.by.cat")}</Opt>
                  <Opt on={by === "genre"} onClick={() => setBy("genre")}>{t("pw.by.genre")}</Opt>
                </div>
              )}
              <div data-nav-group className="ms-auto flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t("pw.browse.sort")}</span>
                {SORTS.map((s) => <Opt key={s} on={s === sort} onClick={() => setSort(s)}>{t(`hooks.sort.${s}`)}</Opt>)}
              </div>
            </div>
            <SourceFilter />
            {by === "genre" && B.genres.length ? <Chips items={B.genres} active="" onPick={B.openGenre} /> : <Chips items={[ALL, FAV, ...B.groups]} active={c} onPick={setC} locked={B.isLocked} />}
          </div>
          <div className="min-h-0 flex-1"><PosterGrid items={items} pct={B.pct} onOpen={B.open} empty={t("pw.browse.nothing")} /></div>
        </div>
      )}
    </Shell>
  )
}
