import { catsOf } from "@/lib/merge-pure"
import { useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import { Check, X } from "lucide-react"
import { Pill } from "@/components/gtv"
import { SourceMark } from "@/components/source/SourceMark"
import { TextInput } from "@/components/tv/text-input"
import { focusFirst } from "@/lib/nav"
import { useMode } from "@/lib/device"
import { useApp } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { RATINGS, decadesOf, moreCount, type More, type Watch } from "@/lib/browse-pure"
import { cn } from "@/lib/utils"
import { useCatalogView, useSourceFilter } from "@/layouts/hooks/use-source-filter"
import type { Kind } from "@/lib/types"

type BrowseKind = Exclude<Kind, "live">
const EMPTY: string[] = []
const NONE: More = {}
type Sec = "watch" | "decade" | "rating" | "sources" | "cats"

/** Open state of the browse filter panel (`kind` = which browse page it was opened from; null = closed). */
export const useFilterPanel = create<{ kind: BrowseKind | null }>(() => ({ kind: null }))
export const openFilterPanel = (kind: BrowseKind) => useFilterPanel.setState({ kind })
export const closeFilterPanel = () => useFilterPanel.setState({ kind: null })

/** Chip / pill text of the extra filters (shared with the filter bar). */
export function useMoreLabels() {
  const t = useT()
  return { watch: (w: Watch) => t(`gtv.filters.watch.${w}`), decade: (d: number) => t("gtv.filters.decade", { d: String(d) }), rating: (r: number) => `★ ${r}+` }
}

/** Pick several sources and categories at once, plus watch state / decade / minimum rating: the grid shows titles matching all of them (nothing picked = all).
 *  A dialog with a section list (pick counts) beside the one open section; phones: a bottom sheet with the sections as a chip row. Picks apply at once, Back closes. */
export function FilterPanel() {
  const kind = useFilterPanel((s) => s.kind)
  const t = useT()
  const { sources, filter, toggle: toggleSource, clear: clearSources, multi } = useSourceFilter()
  const { byKind, groups } = useCatalogView()
  const cats = useApp((s) => (kind ? s.catFilter[kind] : EMPTY))
  const setCatFilter = useApp((s) => s.setCatFilter)
  const more = useApp((s) => (kind ? s.moreFilter[kind] : NONE))
  const setMoreFilter = useApp((s) => s.setMoreFilter)
  const ml = useMoreLabels()
  const mobile = useMode() === "mobile"
  const [q, setQ] = useState("")
  const [sec, setSec] = useState<Sec>("watch")
  useEffect(() => { if (kind) { setQ(""); setSec("watch"); requestAnimationFrame(focusFirst) } }, [kind])

  const k = kind ?? "movie"
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const i of byKind[k]) for (const c of catsOf(i)) m.set(c, (m.get(c) ?? 0) + 1); return m }, [byKind, k])
  const decades = useMemo(() => decadesOf(byKind[k]), [byKind, k])
  const hasRating = useMemo(() => byKind[k].some((i) => parseFloat(i.rating ?? "") > 0), [byKind, k])
  if (!kind) return null

  const toggleCat = (c: string) => setCatFilter(kind, cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])
  const needle = q.trim().toLowerCase()
  const shown = needle ? groups[k].filter((g) => g.toLowerCase().includes(needle)) : groups[k]
  const active = filter.length + cats.length + moreCount(more)
  // one pick per group: picking the active option again clears it
  const pick = <K extends keyof More>(key: K, v: More[K]) => setMoreFilter(kind, { ...more, [key]: more[key] === v ? undefined : v })

  // every option is a full-width row, one per line: on TV Left from any of them goes back to the section list (a row of pills would be a wall)
  const row = (key: string, on: boolean, label: React.ReactNode, onClick: () => void, count?: number) => (
    <button key={key} data-nav aria-pressed={on} onClick={onClick}
      className={cn("flex min-h-12 w-full shrink-0 items-center gap-3 rounded-2xl px-4 text-start text-base", on ? "bg-accent-blue-container text-foreground" : "text-foreground/85 hover:bg-[var(--fg-10)]")}>
      {label}
      {count != null && <span dir="ltr" className="ms-auto shrink-0 text-sm tabular-nums text-muted-foreground">{fmt.number(count)}</span>}
      <Check className={cn("size-5 shrink-0", count == null && "ms-auto", !on && "opacity-0")} />
    </button>
  )
  const opts = <K extends keyof More>(key: K, list: [NonNullable<More[K]>, string][]) => list.map(([v, label]) => row(String(v), more[key] === v, <bdi className="min-w-0 flex-1 truncate">{label}</bdi>, () => pick(key, v)))

  const watch = (kind === "series" ? ["new", "started"] as const : ["new", "started", "done"] as const).map((w): [Watch, string] => [w, ml.watch(w)])
  const sections: { key: Sec; label: string; n: number; show: boolean }[] = [
    { key: "watch", label: t("gtv.filters.watch"), n: more.watch ? 1 : 0, show: true },
    { key: "decade", label: t("gtv.filters.year"), n: more.decade ? 1 : 0, show: decades.length > 1 },
    { key: "rating", label: t("gtv.filters.rating"), n: more.rating ? 1 : 0, show: hasRating },
    { key: "sources", label: t("gtv.filters.sources"), n: filter.length, show: multi },
    { key: "cats", label: t("gtv.filters.categories"), n: cats.length, show: true },
  ]
  const list = sections.filter((x) => x.show)
  const cur = list.some((x) => x.key === sec) ? sec : list[0].key

  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.filters.title")} onClick={(e) => e.target === e.currentTarget && closeFilterPanel()}
      className={cn("fixed inset-0 z-50 flex m-fade", mobile ? "items-end bg-black/50" : "items-center justify-center bg-black/60 p-4")}>
      <div className={cn("flex flex-col overflow-hidden bg-surface text-foreground shadow-2xl", mobile ? "m-rise h-[85vh] w-full rounded-t-[28px] border-t border-[var(--fg-10)] pb-[var(--safe-b)]" : "m-pop h-[min(38rem,calc(100vh-2rem))] w-full max-w-[52rem] rounded-[28px]")}>
        <div className="flex items-center gap-3 px-6 pb-3 pt-5">
          <h2 className="text-2xl font-semibold">{t("gtv.filters.title")}</h2>
          {active > 0 && <span className="rounded-full bg-accent-blue-container px-3 py-1 text-sm font-medium tabular-nums">{t("gtv.filters.picked", { n: fmt.number(active) })}</span>}
          <button data-nav data-pill aria-label={t("common.close")} onClick={closeFilterPanel} className="ms-auto grid size-10 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
        </div>

        <div className={cn("flex min-h-0 flex-1 border-y border-[var(--fg-10)]", mobile ? "flex-col" : "flex-row")}>
          <nav data-nav-group aria-label={t("gtv.filters.title")} className={cn("no-scrollbar flex shrink-0 gap-1 p-3", mobile ? "flex-row overflow-x-auto" : "w-56 flex-col overflow-y-auto border-e border-[var(--fg-10)]")}>
            {list.map((x) => (
              <button key={x.key} data-nav data-pill data-autofocus={x.key === cur ? "" : undefined} aria-current={x.key === cur ? "true" : undefined} onClick={() => setSec(x.key)} onFocus={() => !mobile && setSec(x.key)}
                className={cn("flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-start text-base", x.key === cur ? "bg-surface-3 font-medium text-foreground" : "text-muted-foreground hover:bg-[var(--fg-10)]")}>
                <span className="min-w-0 flex-1 truncate">{x.label}</span>
                {x.n > 0 && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent-blue px-1.5 text-xs font-semibold tabular-nums text-white">{fmt.number(x.n)}</span>}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3">
            {cur === "cats" && groups[k].length > 6 && <TextInput data-nav type="search" dir="auto" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gtv.filters.search")} aria-label={t("gtv.filters.search")} className="h-11 shrink-0 rounded-full text-base focus-visible:ring-0 [html[data-mode=mobile]_&]:text-[16px]" />}
            {/* -m/p: room inside the scroller for the TV focus ring (3px), which the scroller would otherwise clip at its edges; rows stay where they were */}
            <div key={cur} data-nav-group className="no-scrollbar m-fade -m-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5">
              {cur === "watch" && opts("watch", watch)}
              {cur === "decade" && opts("decade", decades.map((d): [number, string] => [d, ml.decade(d)]))}
              {cur === "rating" && opts("rating", RATINGS.map((r): [number, string] => [r, ml.rating(r)]))}
              {cur === "sources" && sources.map((x) => row(x.id, filter.includes(x.id), <><SourceMark type={x.type} color={x.color} /><bdi className="min-w-0 flex-1 truncate">{x.title}</bdi></>, () => toggleSource(x.id), x.count))}
              {cur === "cats" && shown.map((c) => row(c, cats.includes(c), <bdi className="min-w-0 flex-1 truncate">{c}</bdi>, () => toggleCat(c), counts.get(c) ?? 0))}
              {cur === "cats" && !shown.length && <div className="py-6 text-center text-muted-foreground">{t("gtv.filters.none")}</div>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-4">
          <Pill disabled={!active} onClick={() => { clearSources(); setCatFilter(kind, []); setMoreFilter(kind, {}) }}>{t("gtv.filters.clear")}</Pill>
          <Pill variant="primary" className="ms-auto min-w-28" onClick={closeFilterPanel}>{t("gtv.filters.done")}</Pill>
        </div>
      </div>
    </div>
  )
}
