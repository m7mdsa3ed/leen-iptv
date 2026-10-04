import { Children, useEffect, useState } from "react"
import type { ButtonHTMLAttributes, ReactNode, SyntheticEvent, WheelEvent } from "react"
import { ChevronRight, Info, Lock, Play, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { fmt, useT } from "@/lib/i18n"
import { isTv } from "@/lib/device"
import { Logo, useLocked } from "@/components/tv/ui"
import { useRemoveMenu } from "@/components/tv/card-menu"
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

const HEAD = 7
/** ponytail: on TV the first HEAD cards paint now, the rest ~250ms later (light first paint; D-pad reaches every card a moment after).
    No content-visibility: off-screen rails would have no layout boxes, so D-pad navigation could not find the rail above/below. Shared by every layout's Row/Rail. */
export function useStaged(children: ReactNode) {
  const kids = Children.toArray(children)
  const [all, setAll] = useState(!isTv || kids.length <= HEAD)
  useEffect(() => { if (all) return; const id = setTimeout(() => setAll(true), 250); return () => clearTimeout(id) }, [all])
  return all ? children : kids.slice(0, HEAD)
}
function RailBody({ title, children, className, onSeeAll }: { title?: ReactNode; children: ReactNode; className?: string; onSeeAll?: () => void }) {
  const t = useT()
  const staged = useStaged(children)
  return (
  <section className={cn("-mx-[var(--gx)] mb-2", className)}>
    {title && onSeeAll ? (
      <div className="px-[var(--gx)]">
        <button data-nav data-pill onClick={onSeeAll} aria-label={t("common.seeAll", { title: typeof title === "string" ? title : "" })} className="-ms-3 mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-2xl font-medium tracking-tight text-foreground">
          {title}<ChevronRight className="rtl-flip size-6 text-muted-foreground" />
        </button>
      </div>
    ) : title ? <SectionTitle className="mb-1 px-[var(--gx)]">{title}</SectionTitle> : null}
    <div data-nav-group className="rail rail-in !mx-0" onWheel={wheel}>{staged}</div>
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
  const onMenu = useRemoveMenu(item)
  const live = item.kind === "live"
  const [loaded, setLoaded] = useState(false)
  const chip = "absolute top-2 grid size-7 place-items-center rounded-full bg-black/60"
  return (
    <button
      data-nav
      data-card
      data-poster
      data-live={live ? "" : undefined}
      data-id={item.id}
      data-hold={onMenu ? "" : undefined}
      onClick={onOpen}
      onContextMenu={onMenu && ((e) => { e.preventDefault(); onMenu() })}
      onFocus={onFocus}
      className={cn("block shrink-0 text-start", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]", className)}
    >
      <div data-tilewrap className="relative rounded-2xl">
      <div data-tile data-fade data-loaded={loaded ? "" : undefined} onLoadCapture={(e: SyntheticEvent) => { if ((e.target as HTMLImageElement).loading === "lazy") setLoaded(true) }} className={cn("relative overflow-hidden rounded-[inherit] bg-surface", variant === "wide" ? "aspect-video" : "aspect-[2/3]", live && "bg-gradient-to-br from-surface-3 to-surface")}>
        <Logo item={item} className={cn("relative size-full", live ? "p-6" : variant === "wide" ? "object-contain" : "object-cover")} />
        {fav && <span className={cn(chip, "end-2")}><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
        {locked && <span className={cn(chip, "start-2")}><Lock className="size-4 text-white" /></span>}
        <SourceBadge item={item} className={cn("absolute start-2", pct ? "bottom-3" : "bottom-2")} />
        {pct ? <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} /></div> : null}
      </div>
      <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
      </div>
      <div className="card-info mt-2 px-1">
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

/** Leen mark (same artwork as public/logo.svg): the sky-blue "Leen" script on a dark navy tile. */
export function LeenMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Leen" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="leen-g" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bae6fd" />
          <stop offset="1" stopColor="#2f80ed" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="26" fill="#101722" />
      <path transform="translate(14.96 32.65) scale(.577) translate(-1.7 -1.3)" fill="url(#leen-g)" d="M30.27 48.35Q31.87 51.10 31.87 53.66Q31.87 54.24 31.78 54.72Q31.68 55.20 31.55 55.71Q30.46 55.58 29.28 55.52Q28.10 55.46 26.82 55.46Q25.28 55.46 23.71 55.55Q22.14 55.65 20.22 55.84Q18.30 56.03 15.94 56.35Q13.57 56.67 10.43 57.18Q8.96 56.67 7.49 55.17Q6.02 53.66 4.74 51.55Q5.38 50.14 6.34 48.06Q7.30 45.98 8.58 43.01Q9.86 40.03 11.42 36.03Q12.99 32.03 14.78 26.78Q15.94 23.33 16.77 20.70Q17.60 18.08 18.27 15.62Q18.94 13.15 19.58 10.46Q20.22 7.78 20.99 4.26Q23.55 4.77 25.44 6.14Q27.33 7.52 29.06 10.08Q28.54 10.91 27.71 12.77Q26.88 14.62 25.76 17.28Q24.64 19.94 23.30 23.30Q21.95 26.66 20.48 30.50Q19.07 34.27 17.73 37.60Q16.38 40.93 15.33 43.62Q14.27 46.30 13.63 48.22Q12.99 50.14 12.99 51.10Q14.02 51.04 14.85 50.98Q15.68 50.91 16.58 50.75Q17.47 50.59 18.53 50.37Q19.58 50.14 21.06 49.76Q22.34 49.44 23.42 49.22Q24.51 48.99 25.57 48.83Q26.62 48.67 27.74 48.58Q28.86 48.48 30.27 48.35 M58.24 25.50Q57.98 29.47 56.83 32.32Q55.68 35.17 53.54 37.31Q51.39 39.46 48.32 41.18Q45.25 42.91 41.15 44.51Q41.15 44.90 41.12 45.31Q41.09 45.73 41.09 46.18Q41.09 47.01 41.22 47.90Q41.34 48.80 41.66 49.57Q41.98 50.34 42.56 50.82Q43.14 51.30 44.03 51.30Q45.76 51.30 47.42 50.53Q49.09 49.76 50.59 48.64Q52.10 47.52 53.41 46.21Q54.72 44.90 55.74 43.81Q56.38 44.38 56.83 44.90Q53.95 48.74 50.53 51.26Q47.10 53.79 44.03 54.50Q39.62 53.98 37.15 51.26Q34.69 48.54 34.69 44.70Q34.69 42.08 35.42 39.36Q36.16 36.64 37.47 34.11Q38.78 31.58 40.54 29.34Q42.30 27.10 44.32 25.44Q46.34 23.78 48.48 22.82Q50.62 21.86 52.74 21.86Q55.68 22.24 58.24 25.50M53.82 27.62Q52.10 27.87 50.24 29.02Q48.38 30.18 46.75 32.10Q45.12 34.02 43.78 36.58Q42.43 39.14 41.66 42.08Q46.78 39.52 50.18 35.78Q53.57 32.03 53.82 27.62 M84.10 25.50Q83.84 29.47 82.69 32.32Q81.54 35.17 79.39 37.31Q77.25 39.46 74.18 41.18Q71.10 42.91 67.01 44.51Q67.01 44.90 66.98 45.31Q66.94 45.73 66.94 46.18Q66.94 47.01 67.07 47.90Q67.20 48.80 67.52 49.57Q67.84 50.34 68.42 50.82Q68.99 51.30 69.89 51.30Q71.62 51.30 73.28 50.53Q74.94 49.76 76.45 48.64Q77.95 47.52 79.26 46.21Q80.58 44.90 81.60 43.81Q82.24 44.38 82.69 44.90Q79.81 48.74 76.38 51.26Q72.96 53.79 69.89 54.50Q65.47 53.98 63.01 51.26Q60.54 48.54 60.54 44.70Q60.54 42.08 61.28 39.36Q62.02 36.64 63.33 34.11Q64.64 31.58 66.40 29.34Q68.16 27.10 70.18 25.44Q72.19 23.78 74.34 22.82Q76.48 21.86 78.59 21.86Q81.54 22.24 84.10 25.50M79.68 27.62Q77.95 27.87 76.10 29.02Q74.24 30.18 72.61 32.10Q70.98 34.02 69.63 36.58Q68.29 39.14 67.52 42.08Q72.64 39.52 76.03 35.78Q79.42 32.03 79.68 27.62 M97.41 20.96Q99.07 21.47 100.54 23.23Q102.02 24.99 102.72 27.10Q102.02 28.83 100.54 31.26Q99.07 33.70 97.60 36.22Q96.13 38.75 94.94 41.02Q93.76 43.30 93.57 44.77Q94.59 43.68 95.84 42.24Q97.09 40.80 98.27 39.36Q99.46 37.92 100.48 36.74Q101.50 35.55 102.08 34.98Q103.30 33.70 104.96 32Q106.62 30.30 108.45 28.80Q110.27 27.30 112.13 26.24Q113.98 25.18 115.52 25.18Q117.18 25.18 118.30 26.30Q119.42 27.42 120.06 28.64Q120.06 28.77 119.58 28.99Q119.10 29.22 118.21 30.24Q117.31 31.39 116.19 33.41Q115.07 35.42 114.02 37.76Q112.96 40.10 112.26 42.53Q111.55 44.96 111.55 46.94Q111.55 48.54 111.97 48.99Q112.38 49.44 113.15 49.44Q113.86 49.44 114.62 49.12Q115.39 48.80 115.84 48.80Q116.10 48.93 116.26 49.34Q116.42 49.76 116.42 50.08Q115.90 50.53 115.20 50.98Q114.50 51.42 113.73 51.81Q112.96 52.19 112.22 52.45Q111.49 52.70 110.91 52.70Q109.06 52.70 107.87 52.16Q106.69 51.62 106.02 50.72Q105.34 49.82 105.09 48.58Q104.83 47.33 104.83 45.92Q104.83 45.15 104.96 44.19Q105.09 43.23 105.47 41.92Q105.86 40.61 106.56 38.78Q107.26 36.96 108.35 34.40Q108.22 34.40 106.62 35.30Q105.02 36.19 103.17 38.05Q100.16 40.93 97.76 43.74Q95.36 46.56 92.86 50.02Q91.46 52 90.40 53.38Q89.34 54.75 88.58 55.20Q87.23 54.43 86.59 53.06Q85.95 51.68 85.63 50.21Q85.63 48.99 85.98 47.14Q86.34 45.28 86.94 43.01Q87.55 40.74 88.45 38.24Q89.34 35.74 90.43 33.25Q92.86 27.62 94.88 24.42Q96.90 21.22 97.41 20.96" />
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
