import { useMemo, useState, type ReactNode } from "react"
import { Check, ChevronDown, LayoutGrid, Search, SlidersHorizontal, X } from "lucide-react"
import { GRID_SIZES } from "@/lib/cards"
import { catsOf } from "@/lib/merge-pure"
import { TextInput } from "@/components/tv/text-input"
import { ActionsMenu, type Act } from "@/components/tv/actions-menu"
import { SourceMark } from "@/components/source/SourceMark"
import { RATINGS, decadesOf, moreCount, type More, type Watch } from "@/lib/browse-pure"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { cn } from "@/lib/utils"
import { useCatalogView, useSourceFilter } from "@/layouts/hooks/use-source-filter"
import type { Sort } from "@/layouts/hooks/use-category"
import type { Kind } from "@/lib/types"

/** Chip text of the extra filters. */
function useMoreLabels() {
  const t = useT()
  return { watch: (w: Watch) => t(`gtv.filters.watch.${w}`), decade: (d: number) => t("gtv.filters.decade", { d: String(d) }), rating: (r: number) => `★ ${r}+` }
}

/** One option chip of the filter tray; `on` = picked (tinted blue with a check, never white, so it never reads as the TV focus fill). */
function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button data-nav data-pill aria-pressed={on} onClick={onClick}
      className={cn("inline-flex min-h-10 max-w-[18rem] shrink-0 items-center gap-2 rounded-full px-4 text-base", on ? "bg-accent-blue-container font-medium text-foreground" : "bg-surface-2 text-foreground/80 hover:bg-surface-3")}>
      {on && <Check aria-hidden className="size-4 shrink-0" />}{children}
    </button>
  )
}

/**
 * Browse filter dock: one framed toolbar (title search, Sort and Grid size menus, a Filters toggle with the number of active filters) that unfolds IN PLACE
 * into a filter tray (no dialog): one labelled row per facet (watch state, decade, rating, sources, categories), each a scrolling line of chips that
 * apply at once. D-pad: Up/Down walk the rows, Left/Right the chips; phones: the label sits above its row. Under the dock: the match count (announced)
 * and a removable chip per active filter.
 * `shown` = titles in the grid while something narrows it (undefined = the untouched sample, no count).
 */
export function BrowseFilters({ kind, q, setQ, sort, setSort, sorts, cats, toggleCat, clearCats, label, shown }: {
  kind: Exclude<Kind, "live">; q: string; setQ: (v: string) => void; sort: Sort; setSort: (s: Sort) => void; sorts: [Sort, string][]
  cats: string[]; toggleCat: (c: string) => void; clearCats: () => void; label: string; shown?: number
}) {
  const t = useT()
  const mobile = useMode() === "mobile"
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState("")
  const { sources, filter, toggle: toggleSource, clear: clearSources, multi } = useSourceFilter()
  const { byKind, groups } = useCatalogView()
  const nameOf = (id: string) => sources.find((s) => s.id === id)?.title ?? id
  const more = useApp((s) => s.moreFilter[kind])
  const setMore = useApp((s) => s.setMoreFilter)
  const ml = useMoreLabels()
  const size = useApp((s) => s.settings.gridSize ?? s.settings.cardSize ?? "normal")
  const setSettings = useApp((s) => s.setSettings)
  const decades = useMemo(() => decadesOf(byKind[kind]), [byKind, kind])
  const hasRating = useMemo(() => byKind[kind].some((i) => parseFloat(i.rating ?? "") > 0), [byKind, kind])
  // titles per category: only while the tray is open (a pass over the whole kind)
  const counts = useMemo(() => {
    if (!open) return null
    const m = new Map<string, number>()
    for (const i of byKind[kind]) for (const c of catsOf(i)) m.set(c, (m.get(c) ?? 0) + 1)
    return m
  }, [open, byKind, kind])
  const set = <K extends keyof More>(key: K, v: More[K]) => setMore(kind, { ...more, [key]: v })
  const watch = (kind === "series" ? ["new", "started"] as const : ["new", "started", "done"] as const).map((w): [Watch, string] => [w, ml.watch(w)])
  const active = filter.length + cats.length + moreCount(more)

  const sortLabel = sorts.find(([s]) => s === sort)?.[1] ?? sorts[0]?.[1] ?? ""
  const menus: { key: string; name: string; value: string; on: boolean; items: Act[]; icon?: ReactNode }[] = [
    { key: "sort", name: t("gtv.filters.sort"), value: sortLabel, on: sort !== "default", items: sorts.map(([s, l]) => ({ label: l, checked: s === sort, run: () => setSort(s) })) },
    { key: "size", name: t("gtv.filters.size"), value: t(`settings.cardSize.${size}`), on: false, icon: <LayoutGrid aria-hidden className="size-4" />, items: GRID_SIZES.map((s) => ({ label: t(`settings.cardSize.${s}`), checked: s === size, run: () => setSettings({ gridSize: s }) })) },
  ]

  // a single-choice facet row: Any (clears it) + every value
  const single = <K extends keyof More>(key: K, list: [NonNullable<More[K]>, string][]) => [
    <Opt key="any" on={more[key] == null} onClick={() => set(key, undefined)}>{t("gtv.filters.any")}</Opt>,
    ...list.map(([v, l]) => <Opt key={String(v)} on={more[key] === v} onClick={() => set(key, more[key] === v ? undefined : v)}><bdi className="truncate">{l}</bdi></Opt>),
  ]
  const needle = find.trim().toLowerCase()
  const catList = needle ? groups[kind].filter((g) => g.toLowerCase().includes(needle)) : groups[kind]
  const findField = groups[kind].length > 12 && (
    <TextInput data-nav type="search" dir="auto" autoComplete="off" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("gtv.filters.search")} aria-label={t("gtv.filters.search")}
      className="h-10 w-full min-w-0 rounded-full text-sm focus-visible:ring-0 max-md:max-w-[12rem] [html[data-mode=mobile]_&]:text-[16px]" />
  )
  const rows: { key: string; name: string; extra?: ReactNode; body: ReactNode }[] = [
    { key: "watch", name: t("gtv.filters.watch"), body: single("watch", watch) },
    ...(decades.length > 1 ? [{ key: "decade", name: t("gtv.filters.year"), body: single("decade", decades.map((d): [number, string] => [d, ml.decade(d)])) }] : []),
    ...(hasRating ? [{ key: "rating", name: t("gtv.filters.rating"), body: single("rating", RATINGS.map((r): [number, string] => [r, ml.rating(r)])) }] : []),
    ...(multi ? [{ key: "sources", name: t("gtv.filters.sources"), body: sources.map((s) => (
      <Opt key={s.id} on={filter.includes(s.id)} onClick={() => toggleSource(s.id)}><SourceMark type={s.type} color={s.color} /><bdi className="truncate">{s.title}</bdi></Opt>
    )) }] : []),
    { key: "cats", name: t("gtv.filters.categories"), extra: findField, body: catList.length ? catList.map((c) => (
      <Opt key={c} on={cats.includes(c)} onClick={() => toggleCat(c)}>
        <bdi className="truncate">{c}</bdi><span dir="ltr" className="shrink-0 text-sm tabular-nums text-muted-foreground">{fmt.number(counts?.get(c) ?? 0)}</span>
      </Opt>
    )) : <span className="py-2 text-sm text-muted-foreground">{t("gtv.filters.none")}</span> },
  ]

  const chip = (key: string, text: ReactNode, name: string, onRemove: () => void) => (
    <button key={key} data-nav data-pill aria-label={t("gtv.filters.remove", { name })} onClick={onRemove}
      className="inline-flex min-h-11 max-w-[18rem] shrink-0 items-center gap-2 rounded-full border border-[var(--fg-10)] bg-accent-blue-container/60 pe-3 ps-4 text-base text-foreground">
      {text}<X aria-hidden className="size-4 shrink-0 opacity-70" />
    </button>
  )
  const qt = q.trim()
  const chips = [
    ...(qt ? [chip("q", <><Search aria-hidden className="size-4 shrink-0 opacity-70" /><bdi className="min-w-0 truncate">{qt}</bdi></>, qt, () => setQ(""))] : []),
    ...filter.map((id) => chip(`s:${id}`, <bdi className="min-w-0 truncate">{nameOf(id)}</bdi>, nameOf(id), () => toggleSource(id))),
    ...cats.map((c) => chip(`c:${c}`, <bdi className="min-w-0 truncate">{c}</bdi>, c, () => toggleCat(c))),
    ...(more.watch ? [chip("w", ml.watch(more.watch), ml.watch(more.watch), () => set("watch", undefined))] : []),
    ...(more.decade ? [chip("d", ml.decade(more.decade), ml.decade(more.decade), () => set("decade", undefined))] : []),
    ...(more.rating ? [chip("r", ml.rating(more.rating), ml.rating(more.rating), () => set("rating", undefined))] : []),
  ]
  const trayId = `filters-${kind}`

  return (
    <div className="pb-3">
      <div className="rounded-[28px] border border-[var(--fg-10)] bg-surface p-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,.5)]">
        <div role="toolbar" aria-label={t("gtv.filters.title")} data-nav-group className={cn("flex gap-2", mobile ? "flex-col" : "flex-wrap items-center")}>
          {/* the search well: an icon, the field, and a clear button once something is typed */}
          <label className={cn("relative flex min-h-12 items-center rounded-full bg-surface-2 focus-within:ring-2 focus-within:ring-accent-blue", mobile ? "w-full" : "min-w-[16rem] max-w-[28rem] flex-1")}>
            <Search aria-hidden className="pointer-events-none absolute start-4 size-5 text-muted-foreground" />
            <TextInput data-nav aria-label={label} dir="auto" type="search" autoComplete="off" placeholder={label} value={q} onChange={(e) => setQ(e.target.value)}
              className="h-12 w-full rounded-full border-0 bg-transparent pe-12 ps-12 text-base focus-visible:ring-0 dark:bg-transparent md:text-base [html[data-mode=mobile]_&]:text-[16px]" />
            {q && <button data-nav data-pill aria-label={t("gtv.filters.clearSearch")} onClick={() => setQ("")} className="absolute end-1.5 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-[var(--fg-10)]"><X aria-hidden className="size-4" /></button>}
          </label>

          <div className={cn("flex gap-2", mobile ? "no-scrollbar -mx-2 overflow-x-auto px-2" : "flex-wrap items-center")}>
            {menus.map((f) => (
              <ActionsMenu key={f.key} items={f.items} trigger={(o) => (
                <button data-nav data-pill aria-haspopup="menu" aria-expanded={o.open} aria-label={`${f.name}: ${f.value}`} onClick={o.toggle}
                  className={cn("flex min-h-12 shrink-0 items-center gap-3 rounded-[20px] pe-3 ps-4 text-start", f.on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground", o.open && "ring-2 ring-accent-blue")}>
                  {f.icon}
                  <span className="flex flex-col leading-tight">
                    <span className="text-xs font-medium text-muted-foreground">{f.name}</span>
                    <span className="whitespace-nowrap text-base font-medium">{f.value}</span>
                  </span>
                  <ChevronDown aria-hidden className={cn("size-4 shrink-0 opacity-70 transition-transform", o.open && "rotate-180")} />
                </button>
              )} />
            ))}
            <button data-nav data-pill aria-expanded={open} aria-controls={trayId} onClick={() => setOpen((x) => !x)}
              aria-label={active ? `${t("gtv.filters.title")} (${t("gtv.filters.picked", { n: fmt.number(active) })})` : t("gtv.filters.title")}
              className={cn("flex min-h-12 shrink-0 items-center gap-2 rounded-[20px] px-4 text-base font-medium", open || active ? "bg-accent-blue-container" : "bg-surface-2")}>
              <SlidersHorizontal aria-hidden className="size-5" />{t("gtv.filters.title")}
              {active > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent-blue px-1.5 text-xs font-semibold tabular-nums text-white">{fmt.number(active)}</span>}
              <ChevronDown aria-hidden className={cn("size-4 shrink-0 opacity-70 transition-transform", open && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* the filter tray: unfolds inside the dock, one labelled row of chips per facet */}
        {open && (
          <div id={trayId} role="region" aria-label={t("gtv.filters.title")} className="m-fade mt-2 flex flex-col gap-3 border-t border-[var(--fg-10)] px-2 pb-2 pt-4">
            {rows.map((r) => (
              <div key={r.key} className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)] md:items-start md:gap-4">
                <div className="flex min-w-0 items-center gap-3 md:min-h-10 md:flex-col md:items-stretch md:justify-center md:gap-2">
                  <span className="shrink-0 text-sm font-medium text-muted-foreground">{r.name}</span>
                  {r.extra}
                </div>
                {/* -m/p: room inside the scroller for the TV focus ring, which it would otherwise clip */}
                <div data-nav-group="memory" data-scroll-x className="no-scrollbar -m-1 flex min-w-0 gap-2 overflow-x-auto p-1">{r.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(shown != null || chips.length > 0) && (
        <div data-nav-group className={cn("flex items-center gap-2 pt-3", mobile ? "no-scrollbar -ms-[var(--gs)] -me-[var(--gx)] overflow-x-auto ps-[var(--gs)] pe-[var(--gx)]" : "flex-wrap")}>
          {/* polite live region: screen readers hear the new count after each change */}
          <span role="status" aria-live="polite" className="me-1 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{shown != null ? fmt.plural("gtv.category.count", shown) : ""}</span>
          {chips}
          {chips.length > 0 && (
            <button data-nav data-pill onClick={() => { clearSources(); clearCats(); setMore(kind, {}); setQ("") }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-base font-medium text-accent-blue underline-offset-4 hover:underline">
              {t("gtv.filters.clear")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
