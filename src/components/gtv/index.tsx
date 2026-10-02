import { useEffect, useState } from "react"
import type { ButtonHTMLAttributes, ReactNode, SyntheticEvent, WheelEvent } from "react"
import { ChevronRight, Info, Lock, Play, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { Logo, useLocked } from "@/components/tv/ui"
import { SourceBadge } from "@/components/source/SourceBadge"
import type { Item } from "@/lib/types"

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

function RailBody({ title, children, className, onSeeAll }: { title?: ReactNode; children: ReactNode; className?: string; onSeeAll?: () => void }) {
  const t = useT()
  return (
  // No content-visibility here: off-screen rails would have no layout boxes, so D-pad navigation could not find the rail above/below
  // and focus jumped to the top bar. Cards are capped per rail and images are lazy, so rendering them all is cheap enough.
  <section className={cn("-mx-[var(--gx)] mb-2", className)}>
    {title && onSeeAll ? (
      <div className="px-[var(--gx)]">
        <button data-nav data-pill onClick={onSeeAll} aria-label={t("common.seeAll", { title: typeof title === "string" ? title : "" })} className="-ms-3 mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-2xl font-medium tracking-tight text-foreground">
          {title}<ChevronRight className="rtl-flip size-6 text-muted-foreground" />
        </button>
      </div>
    ) : title ? <SectionTitle className="mb-1 px-[var(--gx)]">{title}</SectionTitle> : null}
    <div className="rail rail-in !mx-0" onWheel={wheel}>{children}</div>
  </section>
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

/** Coloured initial circle (not interactive; wrap in a button). Size via className, default size-10. */
export const Avatar = ({ name, color, className }: { name: string; color: string; className?: string }) => (
  <div style={{ background: color }} className={cn("grid size-10 shrink-0 place-items-center rounded-full font-medium text-white", className)}>
    {(name.trim()[0] || "?").toUpperCase()}
  </div>
)

/** Rail card. wide = 16:9 (live, continue watching), poster = 2:3 (VOD). fluid = fill the parent width (grids) instead of the fixed rail width. */
export function Card({ item, variant = "poster", pct, onOpen, onFocus, sub, fluid, className }: {
  item: Item; variant?: "poster" | "wide"; pct?: number; onOpen: () => void; onFocus?: () => void; sub?: string; fluid?: boolean; className?: string
}) {
  const fav = useApp((s) => !!s.profileId && s.data[s.profileId]?.favs.includes(item.id))
  const locked = useLocked(item)
  const live = item.kind === "live"
  const [loaded, setLoaded] = useState(false)
  const chip = "absolute top-2 grid size-7 place-items-center rounded-full bg-black/60"
  return (
    <button
      data-nav
      data-card
      data-id={item.id}
      onClick={onOpen}
      onFocus={onFocus}
      className={cn("block shrink-0 text-start", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]", className)}
    >
      <div data-tilewrap className="relative rounded-2xl">
      <div data-tile data-loaded={loaded ? "" : undefined} onLoadCapture={(e: SyntheticEvent) => { if ((e.target as HTMLImageElement).loading === "lazy") setLoaded(true) }} className={cn("relative overflow-hidden rounded-[inherit] bg-surface", variant === "wide" ? "aspect-video" : "aspect-[2/3]", live && "bg-gradient-to-br from-surface-3 to-surface")}>
        <Logo item={item} className={cn("relative size-full", live ? "p-6" : variant === "wide" ? "object-contain" : "object-cover")} />
        {fav && <span className={cn(chip, "end-2")}><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
        {locked && <span className={cn(chip, "start-2")}><Lock className="size-4 text-white" /></span>}
        <SourceBadge item={item} className={cn("absolute start-2", pct ? "bottom-3" : "bottom-2")} />
        {pct ? <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} /></div> : null}
      </div>
      <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="mt-2 px-1">
        <div dir="auto" className="truncate text-base text-foreground">{item.name}</div>
        {sub ? <div className="truncate text-sm text-muted-foreground">{sub}</div> : null}
      </div>
    </button>
  )
}

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
    <section className="relative -mx-[var(--gx)] mb-4 overflow-hidden bg-gradient-to-br from-accent-blue-container via-surface to-background">
      {layers.map((l, i) => (
        <div key={l.k} aria-hidden className={cn("absolute inset-0", i > 0 && "m-fade")}>
          <img src={l.src} alt="" className="size-full object-cover opacity-40" decoding="async" />
        </div>
      ))}
      <div className="absolute inset-0 bg-background/40" />
      <div className="absolute inset-0 bg-gradient-to-r rtl:bg-gradient-to-l from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative flex min-h-[min(20rem,55vh)] flex-col justify-end gap-3 px-[var(--gx)] pb-6 pt-[calc(var(--hdr)+2.5rem)] md:min-h-[min(24rem,50vh)]">
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

/** Leen mark (same artwork as public/logo.svg): a soft sky-blue play button on a dark navy tile. */
export function LeenMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Leen" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="leen-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#2f80ed" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="26" fill="#101722" />
      <path d="M38 33V67L67 50Z" fill="url(#leen-g)" stroke="url(#leen-g)" strokeWidth="14" strokeLinejoin="round" />
    </svg>
  )
}

/* ---------- loading skeletons (same footprints as the real Card / Rail / Hero so nothing jumps when data arrives) ---------- */
const sk = "skel"

export const SkelBar = ({ className }: { className?: string }) => <div aria-hidden className={cn(sk, "h-4 rounded-full", className)} />

export function SkelCard({ variant = "poster", fluid }: { variant?: "poster" | "wide"; fluid?: boolean }) {
  return (
    <div aria-hidden className={cn("shrink-0", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]")}>
      <div className={cn(sk, "rounded-2xl", variant === "wide" ? "aspect-video" : "aspect-[2/3]")} />
      <SkelBar className="mx-1 mt-3 w-3/4" />
    </div>
  )
}

export function SkelRail({ variant = "poster", n = 10, title = true }: { variant?: "poster" | "wide"; n?: number; title?: boolean }) {
  return (
    <section aria-hidden className="-mx-[var(--gx)] mb-2">
      {title && <div className={cn(sk, "mx-[var(--gx)] mb-1 h-7 w-56 rounded-full")} />}
      <div className="rail !mx-0 overflow-hidden">{Array.from({ length: n }, (_, i) => <SkelCard key={i} variant={variant} />)}</div>
    </section>
  )
}

export function SkelGrid({ variant = "poster", n = 18 }: { variant?: "poster" | "wide"; n?: number }) {
  return (
    <div aria-hidden className="grid gap-4 pt-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${variant === "wide" ? "14rem" : "9.5rem"}, 1fr))` }}>
      {Array.from({ length: n }, (_, i) => <SkelCard key={i} variant={variant} fluid />)}
    </div>
  )
}

export function SkelHero() {
  return (
    <section aria-hidden className="relative -mx-[var(--gx)] mb-4 overflow-hidden bg-gradient-to-br from-accent-blue-container via-surface to-background">
      <div className="relative flex min-h-[min(20rem,55vh)] flex-col justify-end gap-3 px-[var(--gx)] pb-6 pt-[calc(var(--hdr)+2.5rem)] md:min-h-[min(24rem,50vh)]">
        <SkelBar className="w-28" />
        <div className={cn(sk, "h-10 w-96 max-w-full rounded-full")} />
        <SkelBar className="w-64 max-w-full" />
        <div className="mt-2 flex items-center gap-3">
          <div className={cn(sk, "h-12 w-32 rounded-full")} />
          <div className={cn(sk, "size-12 rounded-full")} />
          <div className={cn(sk, "size-12 rounded-full")} />
        </div>
      </div>
    </section>
  )
}
