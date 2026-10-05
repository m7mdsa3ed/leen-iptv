import { SlidersHorizontal, X } from "lucide-react"
import { Pill } from "@/components/gtv"
import { Input } from "@/components/ui/input"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { useMoreLabels } from "./filter-panel"
import { useSourceFilter } from "@/layouts/hooks/use-source-filter"
import { openFilterPanel } from "./filter-panel"
import type { Sort } from "@/layouts/hooks/use-category"
import type { Kind } from "@/lib/types"

/** Browse filter bar: the Filters button (with a count), the title search, the sort pills, then a removable chip per picked source / category / extra filter. */
export function BrowseFilters({ kind, q, setQ, sort, setSort, sorts, cats, toggleCat, clearCats, activeCount, label }: {
  kind: Exclude<Kind, "live">; q: string; setQ: (v: string) => void; sort: Sort; setSort: (s: Sort) => void; sorts: [Sort, string][]
  cats: string[]; toggleCat: (c: string) => void; clearCats: () => void; activeCount: number; label: string
}) {
  const t = useT()
  const { sources, filter, toggle: toggleSource, clear: clearSources } = useSourceFilter()
  const nameOf = (id: string) => sources.find((s) => s.id === id)?.title ?? id
  const more = useApp((s) => s.moreFilter[kind])
  const setMore = useApp((s) => s.setMoreFilter)
  const ml = useMoreLabels()
  const chip = (key: string, text: string, onRemove: () => void) => (
    <button key={key} data-nav onClick={onRemove} className="inline-flex min-h-11 max-w-[16rem] items-center gap-2 rounded-full bg-surface-2 px-4 text-base text-foreground/80">
      <bdi className="min-w-0 truncate">{text}</bdi><X className="size-4 shrink-0" />
    </button>
  )
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 pb-2">
        <Pill data-nav variant={activeCount ? "primary" : "tonal"} onClick={() => openFilterPanel(kind)}>
          <SlidersHorizontal className="size-4" />{t("gtv.filters.title")}{activeCount ? ` (${fmt.number(activeCount)})` : ""}
        </Pill>
        <Input data-nav aria-label={label} dir="auto" className="h-11 w-48 rounded-full text-base focus-visible:ring-0 md:w-64 [html[data-mode=mobile]_&]:text-[16px]" type="search" autoComplete="off" placeholder={label} value={q} onChange={(e) => setQ(e.target.value)} />
        {sorts.map(([s, sLabel]) => <Pill key={s} variant={sort === s ? "primary" : "tonal"} onClick={() => setSort(s)}>{sLabel}</Pill>)}
      </div>
      {activeCount > 0 && (
        <div data-nav-group className="flex flex-wrap items-center gap-2 pb-2">
          {filter.map((id) => chip(`s:${id}`, nameOf(id), () => toggleSource(id)))}
          {cats.map((c) => chip(`c:${c}`, c, () => toggleCat(c)))}
          {more.watch && chip("w", ml.watch(more.watch), () => setMore(kind, { ...more, watch: undefined }))}
          {more.decade && chip("d", ml.decade(more.decade), () => setMore(kind, { ...more, decade: undefined }))}
          {more.rating && chip("r", ml.rating(more.rating), () => setMore(kind, { ...more, rating: undefined }))}
          <button data-nav onClick={() => { clearSources(); clearCats(); setMore(kind, {}) }} className="inline-flex min-h-11 items-center rounded-full px-4 text-base text-muted-foreground hover:text-foreground">{t("gtv.filters.clear")}</button>
        </div>
      )}
    </>
  )
}
