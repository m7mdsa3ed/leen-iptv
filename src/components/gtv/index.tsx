import { Children, memo, useEffect, useMemo, useState } from "react"
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SyntheticEvent, WheelEvent } from "react"
import { ChevronRight, Info, Lock, Play, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { isTv } from "@/lib/device"
import { Logo } from "@/components/tv/ui"
import { useRemoveMenu } from "@/components/tv/card-menu"
import { SourceBadge } from "@/components/source/SourceBadge"
import type { Item } from "@/lib/types"
import { wantMeta } from "@/lib/meta/queue"

type Btn = ButtonHTMLAttributes<HTMLButtonElement>

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn("text-2xl font-medium tracking-tight text-foreground", className)}>{children}</h2>
)

// mouse wheel scrolls a rail sideways (desktop only; TV/mobile have no wheel)
const wheel = (e: WheelEvent<HTMLDivElement>) => {
  const el = e.currentTarget
  if (document.documentElement.dataset.mode !== "desktop" || e.deltaX || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += document.documentElement.dir === "rtl" ? -e.deltaY : e.deltaY // scrollLeft is negative in RTL
}

/** Title over a horizontally scrolling row. Children are Cards (or anything shrink-0). Bleeds to the screen edges. */
export const Rail = ({ title, children, className, onSeeAll }: { title?: ReactNode; children: ReactNode; className?: string; onSeeAll?: () => void }) => <RailBody title={title} className={className} onSeeAll={onSeeAll}>{children}</RailBody>

const HEAD = 7
/** ponytail: on TV the first HEAD cards paint now, the rest ~250ms later (light first paint; D-pad reaches every card a moment after).
    No content-visibility: off-screen rails would have no layout boxes, so D-pad navigation could not find the rail above/below. Shared by every layout's Row/Rail. */
export function useStaged(children: ReactNode) {
  const kids = Children.toArray(children)
  const [all, setAll] = useState(!isTv || kids.length <= HEAD)
  useEffect(() => { if (all) return; const id = setTimeout(() => setAll(true), 250); return () => clearTimeout(id) }, [all])
  return all ? kids : kids.slice(0, HEAD) // both lists come from toArray (same keys): the first cards are not remounted, and so not stripped of focus, when the rest arrives
}
function RailBody({ title, children, className, onSeeAll }: { title?: ReactNode; children: ReactNode; className?: string; onSeeAll?: () => void }) {
  const t = useT()
  const staged = useStaged(children)
  return (
  <section className={cn("-ms-[var(--gs)] -me-[var(--gx)] mb-2", className)}>
    {title && onSeeAll ? (
      <div className="ps-[var(--gs)] pe-[var(--gx)]">
        <button data-nav data-pill onClick={onSeeAll} aria-label={t("common.seeAll", { title: typeof title === "string" ? title : "" })} className="-ms-3 mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-2xl font-medium tracking-tight text-foreground">
          {title}<ChevronRight className="rtl-flip size-6 text-muted-foreground" />
        </button>
      </div>
    ) : title ? <SectionTitle className="mb-1 ps-[var(--gs)] pe-[var(--gx)]">{title}</SectionTitle> : null}
    <div data-nav-group className="rail rail-in !mx-0" onWheel={wheel}>{staged}</div>
  </section>
  )
}

/** One item of the Google TV side navigation rail (layouts/googletv shell): icon only while the rail is closed, icon + label once it opens (the label only fades,
    so it stays the accessible name). `badge` = a count or dot on the icon (status items). Look: "Side navigation rail" in layouts/googletv/layout.css. */
export function RailItem({ label, current, home, badge, children, className, type = "button", ...p }: Btn & { label: string; current?: boolean; home?: boolean; badge?: ReactNode }) {
  return (
    <button data-nav data-pill data-nav-home={home ? "" : undefined} aria-current={current ? "page" : undefined} type={type} {...p} className={cn("gtv-rail-item", className)}>
      <span aria-hidden className="gtv-rail-ico">{children}{badge != null && badge !== false && <span className="gtv-rail-badge">{badge}</span>}</span>
      <span dir="auto" className="gtv-rail-label">{label}</span>
    </button>
  )
}

/** White pill = primary action. tonal = surface pill. ghost = text only. On TV every pill turns white when focused. */
export function Pill({ variant = "tonal", className, type = "button", ...p }: Btn & { variant?: "primary" | "tonal" | "ghost" }) {
  return (
    <button
      data-nav
      data-pill
      data-primary={variant === "primary" ? "" : undefined}
      type={type}
      {...p}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-base font-medium whitespace-nowrap disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
        variant === "primary" && "bg-foreground text-background",
        variant === "tonal" && "bg-surface-2 text-foreground",
        variant === "ghost" && "bg-transparent text-foreground/80",
        className,
      )}
    />
  )
}

/** Round icon button (44px min). Pass the icon as children; `label` is the aria-label. */
export function RoundButton({ label, active, className, type = "button", ...p }: Btn & { label: string; active?: boolean }) {
  return (
    <button
      data-nav
      data-pill
      data-round
      type={type}
      aria-label={label}
      {...p}
      className={cn(
        "grid size-12 min-h-11 min-w-11 shrink-0 place-items-center rounded-full [&_svg]:size-5",
        active ? "bg-surface-3 text-foreground" : "bg-surface-2 text-foreground",
        className,
      )}
    />
  )
}

/** The top bar's small icon button, the same height, shape and icon size as the status chips beside it (queue, sources, bell): 32 px (44 on TV) with a 14 px
    (16 on TV) icon. Use it for actions that live in that cluster; RoundButton is the full-size one (search, back, dialogs). */
export function ChipButton({ label, className, type = "button", children, ...p }: Btn & { label: string }) {
  return (
    <button
      data-nav
      data-pill
      data-round
      type={type}
      aria-label={label}
      title={label}
      {...p}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-surface-2 text-foreground size-8 [&_svg]:size-3.5 [html[data-mode=tv]_&]:size-11 [html[data-mode=tv]_&_svg]:size-4",
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Coloured initial circle (not interactive; wrap in a button). Size via className, default size-10. */
export const Avatar = ({ name, color, photo, className }: { name: string; color: string; photo?: string; className?: string }) => (
  <div style={{ background: color }} className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-full font-medium text-white", className)}>
    {photo ? <img src={photo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : (name.trim()[0] || "?").toUpperCase()}
  </div>
)

/** The two artwork shapes of the app, used by every card, skeleton and detail poster: poster = 2:3 (VOD), wide = 16:9 (live, continue watching, episodes). */
export type ArtVariant = "poster" | "wide"
export const RATIO: Record<ArtVariant, string> = { poster: "aspect-[2/3]", wide: "aspect-video" }
/** TMDB backdrops come as w1280 (panels: original): a card never needs more than w780. */
export const small = (u?: string) => u?.replace(/\/t\/p\/(w1280|original)\//, "/t/p/w780/")

/** One artwork frame. poster: the poster, cropped to 2:3. wide: a channel logo centred on a gradient (live), else the backdrop (16:9, cropped), else the poster whole.
    Children (badges, progress bars) are laid over it; extra props (data-tile ...) go to the frame. */
export function Art({ item, variant = "poster", className, children, ...rest }: { item: Item; variant?: ArtVariant; className?: string; children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const live = item.kind === "live"
  const back = variant === "wide" && !live ? small(item.backdrop) : undefined
  const shown = useMemo(() => (back ? { ...item, logo: back, logoAlt: item.logo } : item), [item, back]) // stable object: Logo's effect deps and img key do not churn on re-render
  return (
    <div {...rest} className={cn("relative overflow-hidden bg-surface", RATIO[variant], live && "bg-gradient-to-br from-surface-3 to-surface", className)}>
      <Logo w={variant === "wide" ? 256 : 152} item={shown} className={cn("relative size-full", live ? "p-6" : variant === "wide" && !back ? "object-contain" : "object-cover")} />
      {children}
    </div>
  )
}

/** Rail card. wide = 16:9 (live, continue watching), poster = 2:3 (VOD). fluid = fill the parent width (grids) instead of the fixed rail width.
    onOpen gets the item (pass a stable page function, not a closure, so the memo holds). fav / locked / badge: page-computed flags; left undefined, the card reads the store itself. */
export const Card = memo(function Card({ item, variant = "poster", pct, onOpen, onFocus, sub, fluid, className, fav: favProp, locked: lockedProp, badge }: {
  item: Item; variant?: ArtVariant; pct?: number; onOpen: (i: Item) => void; onFocus?: () => void; sub?: string; fluid?: boolean; className?: string; fav?: boolean; locked?: boolean; badge?: boolean
}) {
  const favSel = useApp((s) => favProp === undefined && !!s.profileId && !!s.data[s.profileId]?.favs.includes(item.id))
  const lockedSel = useApp((s) => { if (lockedProp !== undefined) return false; const p = s.profiles.find((x) => x.id === s.profileId); return !!p?.pin && p.locked.includes(`${item.kind}|${item.group}`) })
  const fav = favProp ?? favSel
  const locked = lockedProp ?? lockedSel
  const onMenu = useRemoveMenu(item)
  const live = item.kind === "live"
  useEffect(() => wantMeta(item), [item]) // shown = looked up in the background (lib/meta/queue.ts)
  const chip = "absolute top-2 grid size-7 place-items-center rounded-full bg-black/60"
  return (
    <button
      data-nav
      data-card
      data-poster
      data-live={live ? "" : undefined}
      data-id={item.id}
      data-hold={onMenu ? "" : undefined}
      onClick={() => onOpen(item)}
      onContextMenu={onMenu && ((e) => { e.preventDefault(); onMenu() })}
      onFocus={onFocus}
      className={cn("block shrink-0 text-start", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]", className)}
    >
      <div data-tilewrap className="relative rounded-2xl">
      <Art item={item} variant={variant} data-tile data-fade onLoadCapture={(e: SyntheticEvent<HTMLElement>) => { if ((e.target as HTMLImageElement).loading === "lazy") e.currentTarget.setAttribute("data-loaded", "") }} className="rounded-[inherit]">
        {fav && <span className={cn(chip, "end-2")}><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
        {locked && <span className={cn(chip, "start-2")}><Lock className="size-4 text-white" /></span>}
        <SourceBadge item={item} on={badge} className={cn("absolute start-2", pct ? "bottom-3" : "bottom-2")} />
        {pct ? <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} /></div> : null}
      </Art>
      <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="card-info mt-2 px-1">
        <div dir="auto" className="truncate text-base text-foreground">{item.name}</div>
        {sub ? <div className="truncate text-sm text-muted-foreground">{sub}</div> : null}
      </div>
    </button>
  )
})

/** Home hero: blurred enlarged item image, big title, meta line, plot, Play + info + favourite. Full-bleed (cancels the Shell gutter). */
export function Hero({ item, onPlay, onInfo, onFav, isFav, kicker, children }: {
  item?: Item; onPlay: () => void; onInfo?: () => void; onFav: () => void; isFav?: boolean; kicker?: ReactNode; children?: ReactNode
}) {
  const t = useT()
  const meta = item ? [item.group, item.rating ? `★ ${fmt.digits(item.rating)}` : ""].filter(Boolean).join("  ·  ") : ""
  // two stacked layers: the new image fades in (opacity) over the previous one, which is dropped once covered
  const [layers, setLayers] = useState(() => (item?.logo ? [{ k: item.id, src: item.logo }] : []))
  useEffect(() => {
    const src = item?.logo
    if (!src) return setLayers([])
    setLayers((l) => (l[l.length - 1]?.src === src ? l : [...l.slice(-1), { k: item.id, src }]))
    const t = setTimeout(() => setLayers((l) => l.slice(-1)), 500)
    return () => clearTimeout(t)
  }, [item?.id, item?.logo])
  return (
    <section className="relative -ms-[var(--gs)] -me-[var(--gx)] mb-4 overflow-hidden bg-gradient-to-br from-accent-blue-container via-surface to-background">
      {layers.map((l, i) => (
        <div key={l.k} aria-hidden className={cn("absolute inset-0", i > 0 && "m-fade")}>
          <img src={l.src} alt="" className="size-full object-cover opacity-40" decoding="async" />
        </div>
      ))}
      <div className="absolute inset-0 bg-background/40" />
      <div className="absolute inset-0 bg-gradient-to-r rtl:bg-gradient-to-l from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative flex min-h-[min(20rem,55vh)] flex-col justify-end gap-3 ps-[var(--gs)] pe-[var(--gx)] pb-6 pt-[calc(var(--hdr)+2.5rem)] md:min-h-[min(24rem,50vh)]">
        {kicker ? <div className="text-sm font-medium uppercase tracking-widest text-accent-blue">{kicker}</div> : null}
        {item && (
          <>
            <h1 dir="auto" className="line-clamp-2 max-w-3xl text-4xl font-medium tracking-tight text-foreground">{item.name}</h1>
            {meta ? <div dir="auto" className="text-base text-foreground/80">{meta}</div> : null}
            {item.plot ? <p dir="auto" className="line-clamp-3 max-w-2xl text-base text-muted-foreground">{item.plot}</p> : null}
            <div className="mt-2 flex items-center gap-3">
              <Pill variant="primary" onClick={onPlay}><Play className="fill-current" />{t("common.play")}</Pill>
              {onInfo && <RoundButton label={t("common.moreInfo")} onClick={onInfo}><Info /></RoundButton>}
              <RoundButton label={t(isFav ? "common.removeFav" : "common.addFav")} active={isFav} onClick={onFav}>
                <Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} />
              </RoundButton>
            </div>
          </>
        )}
        {children}
      </div>
    </section>
  )
}

/** The mark's one stroke: "لين" as a monoline, written right to left (lam stem, baseline, ya tooth, noon bowl); shared with public/logo.svg and index.html. */
const MARK_PATH = "M74 20V58A8 8 0 0 1 66 66H56V54V66H46A12 12 0 0 1 22 66V56"

/**
 * Leen mark (same artwork as public/logo.svg): the Arabic name as one white monoline with its three dots in ink, on a flat cobalt tile.
 * `animate` plays the intro once: the line is written right to left like the script, then the dots drop in (`.lm-anim` in index.css, follows settings.motion).
 */
export function LeenMark({ className, animate }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Leen" className={cn("shrink-0", animate && "lm-anim", className)}>
      <rect width="100" height="100" rx="24" fill="#145ce6" />
      <g transform="translate(2 0)">
        <path className="lm-line" pathLength={1} d={MARK_PATH} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="lm-dot" cx="34" cy="53" r="4.6" fill="#0e0f11" />
        <circle className="lm-dot" cx="53.5" cy="79" r="4.6" fill="#0e0f11" />
        <circle className="lm-dot" cx="63" cy="79" r="4.6" fill="#0e0f11" />
      </g>
    </svg>
  )
}

/* ---------- loading skeletons (same footprints as the real Card / Rail / Hero so nothing jumps when data arrives) ---------- */
const sk = "skel"

export const SkelBar = ({ className }: { className?: string }) => <div aria-hidden className={cn(sk, "h-4 rounded-full", className)} />

export function SkelCard({ variant = "poster", fluid }: { variant?: ArtVariant; fluid?: boolean }) {
  return (
    <div aria-hidden className={cn("shrink-0", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]")}>
      <div className={cn(sk, "rounded-2xl", RATIO[variant])} />
      <SkelBar className="mx-1 mt-3 w-3/4" />
    </div>
  )
}

export function SkelRail({ variant = "poster", n = 10, title = true }: { variant?: ArtVariant; n?: number; title?: boolean }) {
  return (
    <section aria-hidden className="-ms-[var(--gs)] -me-[var(--gx)] mb-2">
      {title && <div className={cn(sk, "ms-[var(--gs)] me-[var(--gx)] mb-1 h-7 w-56 rounded-full")} />}
      <div className="rail !mx-0 overflow-hidden">{Array.from({ length: n }, (_, i) => <SkelCard key={i} variant={variant} />)}</div>
    </section>
  )
}

export function SkelGrid({ variant = "poster", n = 18 }: { variant?: ArtVariant; n?: number }) {
  return (
    <div aria-hidden className="grid gap-4 pt-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${variant === "wide" ? "14rem" : "9.5rem"}, 1fr))` }}>
      {Array.from({ length: n }, (_, i) => <SkelCard key={i} variant={variant} fluid />)}
    </div>
  )
}

