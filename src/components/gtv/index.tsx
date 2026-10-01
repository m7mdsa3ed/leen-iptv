import type { ButtonHTMLAttributes, ReactNode, WheelEvent } from "react"
import { Info, Lock, Play, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useApp } from "@/lib/store"
import { Logo, useLocked } from "@/components/tv/ui"
import type { Item } from "@/lib/types"

type Btn = ButtonHTMLAttributes<HTMLButtonElement>

export const SectionTitle = ({ children, className }: { children: ReactNode; className?: string }) => (
  <h2 className={cn("text-2xl font-medium tracking-tight text-foreground", className)}>{children}</h2>
)

// mouse wheel scrolls a rail sideways (desktop only; TV/mobile have no wheel)
const wheel = (e: WheelEvent<HTMLDivElement>) => {
  const el = e.currentTarget
  if (document.documentElement.dataset.mode !== "desktop" || e.deltaX || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
}

/** Title over a horizontally scrolling row. Children are Cards (or anything shrink-0). Bleeds to the screen edges. */
export const Rail = ({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn("mb-2 [content-visibility:auto] [contain-intrinsic-size:auto_18rem]", className)}>
    {title ? <SectionTitle className="mb-1">{title}</SectionTitle> : null}
    <div className="rail" onWheel={wheel}>{children}</div>
  </section>
)

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
  const chip = "absolute top-2 grid size-7 place-items-center rounded-full bg-black/60"
  return (
    <button
      data-nav
      data-card
      data-id={item.id}
      onClick={onOpen}
      onFocus={onFocus}
      className={cn("block shrink-0 text-left", fluid ? "w-full" : variant === "wide" ? "w-64" : "w-[9.5rem]", className)}
    >
      <div data-tile className={cn("relative overflow-hidden rounded-2xl bg-surface", variant === "wide" ? "aspect-video" : "aspect-[2/3]", live && "bg-gradient-to-br from-surface-3 to-surface")}>
        {!live && variant === "wide" && item.logo && <img src={item.logo} alt="" aria-hidden className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-xl" />}
        <Logo item={item} className={cn("relative size-full", live ? "p-6" : variant === "wide" ? "object-contain" : "object-cover")} />
        {fav && <span className={cn(chip, "right-2")}><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
        {locked && <span className={cn(chip, "left-2")}><Lock className="size-4 text-white" /></span>}
        {pct ? <div className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><div className="h-full bg-accent-blue" style={{ width: `${pct}%` }} /></div> : null}
      </div>
      <div className="mt-2 px-1">
        <div className="truncate text-base text-foreground">{item.name}</div>
        {sub ? <div className="truncate text-sm text-muted-foreground">{sub}</div> : null}
      </div>
    </button>
  )
}

/** Home hero: blurred enlarged item image, big title, meta line, plot, Play + info + favourite. Full-bleed (cancels the Shell gutter). */
export function Hero({ item, onPlay, onInfo, onFav, isFav, kicker, children }: {
  item?: Item; onPlay: () => void; onInfo?: () => void; onFav: () => void; isFav?: boolean; kicker?: ReactNode; children?: ReactNode
}) {
  const meta = item ? [item.group, item.rating ? `★ ${item.rating}` : ""].filter(Boolean).join("  ·  ") : ""
  return (
    <section className="relative -mx-[var(--gx)] mb-4 overflow-hidden bg-gradient-to-br from-accent-blue-container via-surface to-background">
      {item?.logo && <img key={item.id} src={item.logo} alt="" aria-hidden className="absolute inset-0 size-full animate-in fade-in object-cover opacity-40 duration-300" decoding="async" />}
      <div className="absolute inset-0 bg-background/40" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      <div className="relative flex min-h-[min(20rem,55vh)] flex-col justify-end gap-3 px-[var(--gx)] pb-6 pt-10 md:min-h-[min(24rem,50vh)]">
        {kicker ? <div className="text-sm font-medium uppercase tracking-widest text-accent-blue">{kicker}</div> : null}
        {item && (
          <>
            <h1 className="line-clamp-2 max-w-3xl text-4xl font-medium tracking-tight text-foreground">{item.name}</h1>
            {meta ? <div className="text-base text-foreground/80">{meta}</div> : null}
            {item.plot ? <p className="line-clamp-3 max-w-2xl text-base text-muted-foreground">{item.plot}</p> : null}
            <div className="mt-2 flex items-center gap-3">
              <Pill variant="primary" onClick={onPlay}><Play className="fill-current" />Play</Pill>
              {onInfo && <RoundButton label="More info" onClick={onInfo}><Info /></RoundButton>}
              <RoundButton label={isFav ? "Remove from favorites" : "Add to favorites"} active={isFav} onClick={onFav}>
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

/** Leen IPTV mark (same artwork as public/logo.svg). */
export function LeenMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Leen IPTV" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="leen-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill="url(#leen-g)" />
      <rect x="28" y="22" width="14" height="52" rx="7" fill="#fff" />
      <rect x="28" y="60" width="46" height="14" rx="7" fill="#fff" />
      <path d="M52 30v22l20-11z" fill="#fff" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  )
}
