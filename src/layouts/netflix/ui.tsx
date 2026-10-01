import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, ChevronLeft, ChevronRight, Lock, Play, Plus, ThumbsUp } from "lucide-react"
import { Logo, askPin, useLocked, useOpen } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { KEY, useRoute } from "@/lib/nav"
import { useApp, useProfile } from "@/lib/store"
import { useSourceFilter } from "../hooks/use-source-filter"
import { useSourceOf, type SourceMeta } from "@/lib/sources"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/types"

/** Netflix-style building blocks (tiles that grow on focus/hover, rows, dropdowns). Styles: layout.css (.nf-*). */

export const rating = (i: Item) => { const r = parseFloat(i.rating ?? ""); return r > 0 && r <= 10 ? r : 0 }
/** "NN% Match" derived from the 0-10 rating (0 = unknown). Home billboard only; tiles show the plain rating. */
export const match = (i: Item) => Math.min(99, Math.round(rating(i) * 10))
/** 16:9 tiles when most items have a backdrop, else 2:3 posters. */
export const variantOf = (l: Item[]): "wide" | "poster" => (l.length && l.slice(0, 5).some((i) => i.backdrop) ? "wide" : "poster")

/** Readable text color on a hex chip. */
const onColor = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16) || 0; return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#111111" : "#ffffff" }

/** Source chip on a tile: label + "+N" when other sources carry the same title. Hidden with one source or when Settings > Sources badges are off. */
export function SourceBadge({ item }: { item: Item }) {
  const on = useApp((s) => s.settings.sourceBadges !== false && s.sources.filter((x) => x.enabled !== false).length > 1)
  const src = useSourceOf(item)
  if (!on || !src) return null
  const n = item.alts?.length ?? 0
  return <span className="nf-src-chip" style={{ background: src.color, color: onColor(src.color) }}>{src.label}{n > 0 ? ` +${n}` : ""}</span>
}

/** "All | source..." pill bar with colored dots and counts; the active pill gets an underline in its source color. Hidden with one source. */
export function SourceBar() {
  const { sources, filter, setFilter, multi } = useSourceFilter()
  if (!multi) return null
  const pill = (id: string | null, name: string, color?: string, count?: number) => (
    <button key={id ?? "all"} data-nav aria-pressed={filter === id} onClick={() => setFilter(id)} className="nf-src-pill" style={filter === id ? { boxShadow: `inset 0 -3px 0 ${color ?? "var(--foreground)"}` } : undefined}>
      {color && <span aria-hidden className="nf-src-dot" style={{ background: color }} />}{name}{count != null && <span className="text-muted-foreground">{count}</span>}
    </button>
  )
  return <div data-nav-group role="group" aria-label="Source" className="nf-src-bar">{pill(null, "All")}{sources.map((s) => pill(s.id, s.name, s.color, s.count))}</div>
}

/** "Available on" pills in Detail: pick which source plays. Hidden with one source. */
export function SourceChooser({ list, selected, onSelect }: { list: { item: Item; source: SourceMeta }[]; selected?: Item; onSelect: (i: Item) => void }) {
  if (list.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Available on</span>
      <div data-nav-group className="nf-src-bar !p-0">
        {list.map(({ item, source }) => (
          <button key={item.id} data-nav aria-pressed={item.id === selected?.id} onClick={() => onSelect(item)} className="nf-src-pill" style={item.id === selected?.id ? { boxShadow: `inset 0 -3px 0 ${source.color}` } : undefined}>
            <span aria-hidden className="nf-src-dot" style={{ background: source.color }} />{source.name}<span className="text-muted-foreground">{source.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Best-rated movies + series of the library. */
export function useTopRated(n = 10) {
  const byKind = useCatalog((s) => s.byKind)
  return useMemo(() => [...byKind.movie, ...byKind.series].filter((i) => rating(i) > 0).sort((a, b) => rating(b) - rating(a)).slice(0, n), [byKind, n])
}

/** Play now: movies/channels start the player, series open the detail page (needs an episode). PIN-aware. */
export function usePlay() {
  const go = useRoute((s) => s.go)
  const open = useOpen()
  const p = useProfile()
  return async (i: Item, queue?: Item[]) => {
    if (i.kind === "series") return open(i)
    if (i.kind === "live") return open(i, queue)
    if (p?.pin && p.locked.includes(`${i.kind}|${i.group}`) && !(await askPin(p.pin))) return
    go("player", { queue: [i], index: 0 })
  }
}

/**
 * Tile: 16:9 (wide) or 2:3 (poster). Desktop hover / focus grows it with an info panel (play, +, details); TV focus grows it with a caption.
 * Only transform + opacity animate. The panel buttons exist on desktop only (TV uses OK = details, red key = My List).
 */
export function Tile({ item, variant = "wide", pct, sub, fluid, onOpen, onPlay }: {
  item: Item; variant?: "wide" | "poster"; pct?: number; sub?: string; fluid?: boolean; onOpen: () => void; onPlay?: () => void
}) {
  const mode = useMode()
  const fav = useApp((s) => !!s.profileId && s.data[s.profileId]?.favs.includes(item.id))
  const toggleFav = useApp((s) => s.toggleFav)
  const locked = useLocked(item)
  const live = item.kind === "live"
  const r = rating(item)
  const [hot, setHot] = useState(false) // mount the info panel only while hovered / focused (hundreds of tiles per page)
  const [liked, setLiked] = useState(false)
  const art = variant === "wide" && item.backdrop ? { ...item, logo: item.backdrop } : item
  const noArt = !art.logo
  const meta = [item.year, ...(item.genres?.slice(0, 2) ?? [item.group])].filter(Boolean).join("  ·  ")
  const round = "nf-round grid size-9 place-items-center rounded-full border-2"
  return (
    <div className={cn("nf-tile", fluid && "nf-fluid")} data-v={variant} onMouseEnter={() => setHot(true)} onMouseLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) setHot(false) }} onFocus={() => setHot(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHot(false) }}>
      <div className="nf-pop">
        <button data-nav data-card data-id={item.id} aria-label={item.name} onClick={onOpen} onKeyDown={(e) => e.keyCode === KEY.red && toggleFav(item.id)} onContextMenu={(e) => { if (mode === "mobile") { e.preventDefault(); toggleFav(item.id) } }} className="nf-img">
          <div className={cn("nf-media", variant === "wide" ? "aspect-video" : "aspect-[2/3]", live && "nf-live")}>
            <Logo item={art} className={cn("size-full", live ? "p-5" : "object-cover")} />
            {(live || noArt) && <div className="nf-cap"><div className="truncate font-semibold">{item.name}</div>{sub ? <div className="truncate text-xs opacity-80">{sub}</div> : null}</div>}
            <span className="absolute right-1.5 top-1.5"><SourceBadge item={item} /></span>
            {locked && <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/70"><Lock className="size-3.5 text-white" /></span>}
            {pct ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30"><div className="h-full bg-accent-blue" style={{ width: `${Math.min(100, pct)}%` }} /></div> : null}
          </div>
          <span aria-hidden className="nf-ring" />
        </button>
        {mode !== "mobile" && hot && (
          <div className="nf-info">
            {mode === "desktop" && (
              <div className="mb-2 flex items-center gap-1.5">
                <button data-nav aria-label="Play" onClick={onPlay ?? onOpen} className="nf-round grid size-9 place-items-center rounded-full border-2 border-transparent bg-foreground text-background"><Play className="size-4 fill-current" /></button>
                <button data-nav aria-label={fav ? "Remove from My List" : "Add to My List"} onClick={() => toggleFav(item.id)} className={cn(round, "border-[var(--fg-40)]")}>{fav ? <Check className="size-4" /> : <Plus className="size-4" />}</button>
                {!live && <button data-nav aria-label="Like" aria-pressed={liked} onClick={() => setLiked(!liked)} className={cn(round, "border-[var(--fg-40)]", liked && "bg-foreground text-background")}><ThumbsUp className="size-4" /></button>}
                {!live && <button data-nav aria-label="More info" onClick={onOpen} className={cn(round, "ml-auto border-[var(--fg-40)]")}><ChevronDown className="size-4" /></button>}
              </div>
            )}
            <div className="truncate text-sm font-semibold">{item.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs">
              {r > 0 && <span className="font-bold text-[#46d369]">{r.toFixed(1)} rating</span>}
              <span className="truncate text-muted-foreground">{live ? sub ?? "Live" : meta}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Titled horizontal row. The title becomes "Explore All >" when onSeeAll is given; chevron arrows show on desktop hover. */
export function Row({ title, onSeeAll, children }: { title?: ReactNode; onSeeAll?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useApp((s) => s.settings.motion)
  const by = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: motion === "off" ? "auto" : "smooth" })
  return (
    <section className="nf-rowsec">
      {title ? (
        <h2 className="nf-rowtitle">
          {onSeeAll ? <button data-nav onClick={onSeeAll} className="nf-seeall">{title}<span className="nf-explore">Explore All<ChevronRight className="size-4" /></span></button> : title}
        </h2>
      ) : null}
      <div className="nf-rowwrap">
        <button tabIndex={-1} aria-hidden onClick={() => by(-1)} className="nf-arrow left-0"><ChevronLeft className="size-7" /></button>
        <div ref={ref} data-nav-group className="nf-row">{children}</div>
        <button tabIndex={-1} aria-hidden onClick={() => by(1)} className="nf-arrow right-0"><ChevronRight className="size-7" /></button>
      </div>
    </section>
  )
}

/** Top 10 style row: huge outlined numerals overlapping 2:3 posters. */
export function TopRow({ title, items, onOpen, onPlay }: { title: string; items: Item[]; onOpen: (i: Item) => void; onPlay?: (i: Item) => void }) {
  return (
    <Row title={title}>
      {items.map((i, k) => (
        <div key={i.id} className="nf-top">
          <span aria-hidden className="nf-num">{k + 1}</span>
          <Tile item={i} variant="poster" onOpen={() => onOpen(i)} onPlay={onPlay && (() => onPlay(i))} />
        </div>
      ))}
    </Row>
  )
}

/** Plain responsive grid of tiles (children = Tile with fluid). */
export const Grid = ({ variant = "poster", children }: { variant?: "wide" | "poster"; children: ReactNode }) => <div className="nf-grid" data-v={variant}>{children}</div>

/** Button + popover list. Items inside must be `<button data-nav data-pick>`; focus moves to the selected/first one on open. */
export function Dropdown({ trigger, className, align = "left", panelClass, children }: {
  trigger: ReactNode; className?: string; align?: "left" | "right"; panelClass?: string; children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>("[data-pick][aria-current]") ?? box.current?.querySelector<HTMLElement>("[data-pick]"))?.focus())
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("pointerdown", down)
    return () => document.removeEventListener("pointerdown", down)
  }, [open])
  return (
    <div
      ref={box}
      className="relative inline-block"
      onKeyDown={(e) => { if ((e.key === "Escape" || e.keyCode === 461) && open) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); box.current?.querySelector<HTMLElement>("[data-trig]")?.focus() } }}
      onBlur={(e) => { if (open && e.relatedTarget && !box.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button data-nav data-trig aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={className}>{trigger}</button>
      {open && <div role="menu" className={cn("nf-menu", align === "right" ? "right-0" : "left-0", panelClass)}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

/** Outlined "Genres v" style trigger content. */
export const DropLabel = ({ children }: { children: ReactNode }) => <>{children}<ChevronDown className="size-4" /></>

/** Menu entry for Dropdown. */
export const Pick = ({ active, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button data-nav data-pick role="menuitem" aria-current={active ? "true" : undefined} {...p} className={cn("nf-pick", active && "font-bold", className)} />
)

/** Loading placeholder: billboard (optional) + skeleton rows, same footprint as the real ones. */
export function SkelRows({ n = 3, hero }: { n?: number; hero?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="overflow-hidden">
      {hero && <div className="nf-bb -mx-[var(--gx)] skel" />}
      {Array.from({ length: n }, (_, r) => (
        <section key={r} aria-hidden className="nf-rowsec">
          <div className="nf-rowtitle"><div className="skel h-6 w-48 rounded" /></div>
          <div className="nf-rowwrap"><div className="nf-row">{Array.from({ length: 8 }, (_, i) => <div key={i} className="nf-tile" data-v="wide"><div className="skel aspect-video rounded" /></div>)}</div></div>
        </section>
      ))}
    </div>
  )
}

/** Grid that renders 120 tiles at a time (big categories), with a Show more button. */
export function PagedGrid<T>({ items, variant, render }: { items: T[]; variant?: "wide" | "poster"; render: (t: T) => ReactNode }) {
  const [n, setN] = useState(120)
  useEffect(() => setN(120), [items])
  return (
    <>
      <Grid variant={variant}>{items.slice(0, n).map(render)}</Grid>
      {items.length > n && <div className="-mt-6 pb-24 text-center"><button data-nav onClick={() => setN(n + 120)} className="nf-btn nf-info-btn">Show more</button></div>}
    </>
  )
}
