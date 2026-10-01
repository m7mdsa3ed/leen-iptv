import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useCategory } from "../../hooks/use-category"
import { fmt, useT } from "@/lib/i18n"
import { Capsule, SourceFilter, Tile } from "../ui"

/** One category: big title, sort capsules, then a poster grid. */
export default function Category({ id }: { id: string }) {
  const t = useT()
  const { kind, group, status, ok, all, items, sort, setSort, sorts, pct, open } = useCategory(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={group}>
      {status !== "ready" ? <Pending /> : !ok ? null : (
        <div data-nav-group className="no-scrollbar h-full overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3 pb-1 pt-4">
            <h1 dir="auto" className="atv-h1 me-auto min-w-0 truncate text-[2.5rem]">{group}</h1>
            <span className="text-lg text-muted-foreground">{fmt.plural("atv.category.titles", all.length)}</span>
            {sorts.map(([s, label]) => <Capsule key={s} primary={sort === s} className="!min-h-11 !px-6 !text-base" onClick={() => setSort(s)}>{label}</Capsule>)}
          </div>
          <SourceFilter className="mt-2" />
          {items.length
            ? <div className="atv-grid pt-4">{items.slice(0, 150).map((i) => <Tile key={i.id} item={i} shape="poster" size="fluid" pct={pct(i)} always onOpen={() => open(i)} />)}</div>
            : <div className="h-48"><Empty>{t("atv.category.empty")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
