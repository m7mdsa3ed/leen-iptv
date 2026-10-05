import { useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import { Check } from "lucide-react"
import { Pill } from "@/components/gtv"
import { SourceMark } from "@/components/source/SourceMark"
import { Input } from "@/components/ui/input"
import { focusFirst } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { RATINGS, decadesOf, moreCount, type More, type Watch } from "@/lib/browse-pure"
import { cn } from "@/lib/utils"
import { useCatalogView, useSourceFilter } from "@/layouts/hooks/use-source-filter"
import type { Kind } from "@/lib/types"

type BrowseKind = Exclude<Kind, "live">
const EMPTY: string[] = []
const NONE: More = {}

/** Open state of the browse filter panel (`kind` = which browse page it was opened from; null = closed). */
export const useFilterPanel = create<{ kind: BrowseKind | null }>(() => ({ kind: null }))
export const openFilterPanel = (kind: BrowseKind) => useFilterPanel.setState({ kind })
export const closeFilterPanel = () => useFilterPanel.setState({ kind: null })

/** Chip / pill text of the extra filters (shared with the filter bar). */
export function useMoreLabels() {
  const t = useT()
  return { watch: (w: Watch) => t(`gtv.filters.watch.${w}`), decade: (d: number) => t("gtv.filters.decade", { d: String(d) }), rating: (r: number) => `★ ${r}+` }
}

/** Pick several sources and categories at once, plus watch state / decade / minimum rating: the grid shows titles matching all of them (nothing picked = all). */
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
  const [q, setQ] = useState("")
  useEffect(() => { if (kind) { setQ(""); requestAnimationFrame(focusFirst) } }, [kind])

  const k = kind ?? "movie"
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const i of byKind[k]) m.set(i.group, (m.get(i.group) ?? 0) + 1); return m }, [byKind, k])
  const decades = useMemo(() => decadesOf(byKind[k]), [byKind, k])
  const hasRating = useMemo(() => byKind[k].some((i) => parseFloat(i.rating ?? "") > 0), [byKind, k])
  if (!kind) return null

  const toggleCat = (c: string) => setCatFilter(kind, cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])
  const needle = q.trim().toLowerCase()
  const shown = needle ? groups[k].filter((g) => g.toLowerCase().includes(needle)) : groups[k]
  const active = filter.length + cats.length + moreCount(more)
  // one pick per group: picking the active pill again clears it
  const pick = <K extends keyof More>(key: K, v: More[K]) => setMoreFilter(kind, { ...more, [key]: more[key] === v ? undefined : v })
  const pills = <K extends keyof More>(title: string, key: K, opts: [NonNullable<More[K]>, string][], first?: boolean) => (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div data-nav-group className="flex flex-wrap gap-2">
        {opts.map(([v, label], i) => <Pill key={String(v)} data-nav data-autofocus={first && i === 0 ? "" : undefined} aria-pressed={more[key] === v} variant={more[key] === v ? "primary" : "tonal"} onClick={() => pick(key, v)}><bdi>{label}</bdi></Pill>)}
      </div>
    </div>
  )

  const row = (key: string, on: boolean, count: number, label: React.ReactNode, onClick: () => void) => (
    <button key={key} data-nav aria-pressed={on} onClick={onClick}
      className={cn("flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 text-start text-base", on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")}>
      {label}
      <span dir="ltr" className="ms-auto shrink-0 text-sm tabular-nums text-muted-foreground">{fmt.number(count)}</span>
      <Check className={cn("size-4 shrink-0", !on && "opacity-0")} />
    </button>
  )

  // Order matters for the remote: the controls come first and the long category list LAST, so Clear / Done / the pills are never hundreds of Down presses
  // behind it (picks apply at once, Back closes). The first watch pill is where focus starts, not a button that closes the panel.
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.filters.title")} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeFilterPanel()}>
      <div className="my-auto flex w-full max-w-[46rem] flex-col gap-4 rounded-[28px] bg-surface p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-semibold">{t("gtv.filters.title")}</div>
          {active > 0 && <span className="text-sm text-muted-foreground">{t("gtv.filters.picked", { n: active })}</span>}
          <div className="ms-auto flex items-center gap-2">
            <Pill onClick={() => { clearSources(); setCatFilter(kind, []); setMoreFilter(kind, {}) }}>{t("gtv.filters.clear")}</Pill>
            <Pill variant="primary" onClick={closeFilterPanel}>{t("gtv.filters.done")}</Pill>
          </div>
        </div>
        {pills(t("gtv.filters.watch"), "watch", (kind === "series" ? ["new", "started"] as const : ["new", "started", "done"] as const).map((w): [Watch, string] => [w, ml.watch(w)]), true)}
        {decades.length > 1 && pills(t("gtv.filters.year"), "decade", decades.map((d): [number, string] => [d, ml.decade(d)]))}
        {hasRating && pills(t("gtv.filters.rating"), "rating", RATINGS.map((r): [number, string] => [r, ml.rating(r)]))}
        <div className="grid min-h-0 gap-4 sm:grid-cols-2">
          {multi && (
            <section className="flex min-h-0 flex-col gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">{t("gtv.filters.sources")}</h3>
              <div data-nav-group className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto pe-1">
                {sources.map((s) => row(s.id, filter.includes(s.id), s.count, <><SourceMark type={s.type} color={s.color} /><bdi className="min-w-0 flex-1 truncate">{s.title}</bdi></>, () => toggleSource(s.id)))}
              </div>
            </section>
          )}
          <section className="flex min-h-0 flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t("gtv.filters.categories")}</h3>
            {groups[k].length > 6 && <Input data-nav type="search" dir="auto" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("gtv.filters.search")} aria-label={t("gtv.filters.search")} className="h-11 rounded-full text-base focus-visible:ring-0 [html[data-mode=mobile]_&]:text-[16px]" />}
            <div data-nav-group className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto pe-1">
              {shown.map((c) => row(c, cats.includes(c), counts.get(c) ?? 0, <bdi className="min-w-0 flex-1 truncate">{c}</bdi>, () => toggleCat(c)))}
              {!shown.length && <div className="py-2 text-center text-muted-foreground">{t("gtv.filters.none")}</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
