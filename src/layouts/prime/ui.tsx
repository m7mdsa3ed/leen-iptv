import { useEffect, useState, type ReactNode } from "react"
import { Check, ChevronRight, Lock } from "lucide-react"
import { Logo, useLocked } from "@/components/tv/ui"
import { SourceBadge } from "@/components/source/SourceBadge"
import { useSourceFilter } from "../hooks/use-source-filter"
import { cn } from "@/lib/utils"
import { fmt, useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"

/** Prime-style building blocks. Styles: layout.css (.pv-*). */

/** Wide 16:9 tile (blue included check, optional Top 10 numeral), title (+ optional sub line) under it. Fixed width inside .pv-rail, fills the cell inside .pv-grid. */
export function Tile({ item, pct, sub, rank, onOpen }: { item: Item; pct?: number; sub?: string; rank?: number; onOpen: () => void }) {
  const locked = useLocked(item)
  const live = item.kind === "live"
  return (
    <button data-nav data-card data-poster data-live={live ? "" : undefined} data-id={item.id} onClick={onOpen} className="pv-tile">
      <div className={cn("pv-media", live && "pv-live")}>
        <Logo item={live ? item : { ...item, logo: item.backdrop ?? item.logo }} className={cn("size-full", live ? "p-4" : "object-cover")} />
        <SourceBadge item={item} dot className="absolute end-1.5 top-1.5" />
        {locked && <span className="absolute start-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/70"><Lock className="size-3.5 text-white" /></span>}
        {!live && <span aria-hidden className="pv-check"><Check strokeWidth={3} /></span>}
        {rank ? <span dir="ltr" aria-hidden className="pv-rank">{rank}</span> : null}
        {pct ? <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-accent-blue" style={{ width: `${Math.min(100, pct)}%` }} /></div> : null}
      </div>
      <div dir="auto" className="pv-name">{item.name}</div>
      {sub ? <div dir="auto" className="pv-sub">{sub}</div> : null}
    </button>
  )
}

/** Titled horizontal row of Tiles; the title is a "see all" button when onSeeAll is given. */
export function Row({ title, onSeeAll, children }: { title: ReactNode; onSeeAll?: () => void; children: ReactNode }) {
  const t = useT()
  return (
    <section className="pv-rowsec">
      <h2 className="pv-rowtitle">
        {onSeeAll ? <button data-nav onClick={onSeeAll} aria-label={t("common.seeAll", { title: typeof title === "string" ? title : "" })} className="pv-seeall">{title}<ChevronRight className="rtl-flip size-5" /></button> : title}
      </h2>
      <div data-nav-group className="rail pv-rail">{children}</div>
    </section>
  )
}

/** Grid of Tiles that renders 120 at a time. */
export function PagedGrid<T>({ items, render }: { items: T[]; render: (x: T) => ReactNode }) {
  const [n, setN] = useState(120)
  const t = useT()
  useEffect(() => setN(120), [items])
  return (
    <>
      <div className="pv-grid">{items.slice(0, n).map(render)}</div>
      {items.length > n && <div className="pb-24 text-center"><button data-nav onClick={() => setN(n + 120)} className="pv-btn pv-sec">{t("pv.showMore")}</button></div>}
    </>
  )
}

/** "All | source..." chips; hidden with one source. */
export function SourceBar() {
  const { sources, filter, setFilter, multi } = useSourceFilter()
  const t = useT()
  if (!multi) return null
  const pill = (id: string | null, name: string, color?: string, count?: number) => (
    <button key={id ?? "all"} data-nav aria-pressed={filter === id} onClick={() => setFilter(id)} className="pv-chip">
      {color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />}{name}{count != null && <span dir="ltr" className="opacity-60">{fmt.compact(count)}</span>}
    </button>
  )
  return <div data-nav-group role="group" aria-label={t("pv.source")} className="pv-chips">{pill(null, t("common.all"))}{sources.map((s) => pill(s.id, s.title, s.color, s.count))}</div>
}
