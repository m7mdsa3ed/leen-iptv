import { useEffect, useState } from "react"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import { ChevronRight, Info, Lock, Play, Plus, Check, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Logo, useLocked } from "@/components/tv/ui"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useSourceOf } from "@/lib/sources"
import { useSourceFilter } from "../hooks/use-source-filter"
import { fmt, useT } from "@/lib/i18n"

/** Artwork for wide tiles/hero: Plex/TMDB backdrop when the item has one. */
export const wideArt = (i: Item): Item => (i.backdrop && i.kind !== "live" ? { ...i, logo: i.backdrop } : i)

type Btn = ButtonHTMLAttributes<HTMLButtonElement>

/** Readable text on a source color (plain hex in, Chrome 94 safe). */
const onColor = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#111111" : "#ffffff" }
const Dot = ({ color, className }: { color: string; className?: string }) => <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color }} />

/** Source chip on a tile: colored label (+N when the title exists in more sources). Hidden with one source or settings.sourceBadges off. */
export function SourceBadge({ item, className }: { item: Item; className?: string }) {
  const src = useSourceOf(item)
  const show = useApp((s) => s.settings.sourceBadges !== false && s.sources.filter((x) => x.enabled !== false).length > 1)
  if (!show || !src) return null
  const n = item.alts?.length ?? 0
  return (
    <span dir="auto" title={src.name} className={cn("pointer-events-none absolute z-[1] rounded-full px-2 py-0.5 text-[11px] font-bold leading-4 shadow-sm", className)} style={{ background: src.color, color: onColor(src.color) }}>
      {src.label}{n > 0 ? ` +${n}` : ""}
    </span>
  )
}

/** "All" + one capsule per source (color dot + count); the picked one gets a colored underline. Hidden with one source. */
export function SourceFilter({ className }: { className?: string }) {
  const t = useT()
  const { sources, filter, setFilter, multi } = useSourceFilter()
  if (!multi) return null
  const pill = (id: string | null, name: string, color?: string, count?: number) => {
    const on = filter === id
    return (
      <button key={id ?? "all"} data-nav data-pill aria-pressed={on} onClick={() => setFilter(id)}
        style={on && color ? { boxShadow: `inset 0 -3px 0 ${color}` } : undefined}
        className={cn("atv-pillbtn inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap", on ? "bg-foreground text-background" : "atv-glass text-foreground")}>
        {color && <Dot color={color} />}<bdi>{name}</bdi>{count != null && <span dir="ltr" className="font-normal opacity-70">{fmt.compact(count)}</span>}
      </button>
    )
  }
  return (
    <div data-nav-group role="group" aria-label={t("atv.source.aria")} className={cn("no-scrollbar flex items-center gap-2 overflow-x-auto p-1", className)}>
      {pill(null, t("atv.source.all"))}
      {sources.map((s) => pill(s.id, s.title, s.color, s.count))}
    </div>
  )
}

/** Detail: "Available on" pills, one per source that has the title; picking one switches what plays. */
export function SourceChooser({ options, selectedId, onPick }: { options: { item: Item; source: { name: string; label: string; color: string } }[]; selectedId?: string; onPick: (i: Item) => void }) {
  const t = useT()
  if (options.length < 2) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="atv-kicker me-1">{t("atv.source.availableOn")}</span>
      {options.map(({ item, source }) => {
        const on = item.id === selectedId
        return (
          <button key={item.id} data-nav data-pill aria-pressed={on} onClick={() => onPick(item)} style={on ? { boxShadow: `inset 0 -3px 0 ${source.color}` } : undefined}
            className={cn("atv-pillbtn inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap", on ? "bg-foreground text-background" : "atv-glass text-foreground")}>
            <Dot color={source.color} /><bdi>{source.name}</bdi>
          </button>
        )
      })}
    </div>
  )
}

/** tvOS capsule button: white "Play" (primary) or translucent. */
export function Capsule({ primary, className, type = "button", ...p }: Btn & { primary?: boolean }) {
  return (
    <button data-nav data-pill data-primary={primary ? "" : undefined} type={type} {...p}
      className={cn("atv-btn inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-8 py-2.5 text-lg font-semibold whitespace-nowrap disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0", primary ? "bg-foreground text-background" : "atv-glass text-foreground", className)} />
  )
}

/** Round glass icon button ("+ Up Next"). */
export function Circle({ label, className, type = "button", ...p }: Btn & { label: string }) {
  return <button data-nav data-pill type={type} aria-label={label} title={label} {...p} className={cn("atv-btn atv-glass grid size-12 shrink-0 place-items-center rounded-full text-foreground [&_svg]:size-5", className)} />
}

/** "+ Up Next" toggle = favorite. */
export function UpNextButton({ on, onClick }: { on?: boolean; onClick: () => void }) {
  const t = useT()
  return <Circle label={on ? t("atv.upNext.remove") : t("atv.upNext.add")} aria-pressed={!!on} onClick={onClick}>{on ? <Check /> : <Plus />}</Circle>
}

/** Shelf: bold title aligned with the first card, then a rail. `onTitle` makes the title a "see all" button. */
export function Shelf({ title, onTitle, locked, titleProps, children, className }: { title?: ReactNode; onTitle?: () => void; locked?: boolean; titleProps?: Btn; children: ReactNode; className?: string }) {
  return (
    <section className={cn("atv-shelf -mx-[var(--gx)]", className)}>
      {title ? (
        <div className="px-[var(--gx)]">
          {onTitle ? (
            <button data-nav data-pill onClick={onTitle} {...titleProps} className="atv-shelf-title -ms-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-foreground">
              {title}{locked && <Lock className="size-5" />}<ChevronRight className="rtl-flip size-6 text-muted-foreground" />
            </button>
          ) : <h2 className="atv-shelf-title text-foreground">{title}</h2>}
        </div>
      ) : null}
      <div data-nav-group className="rail !mx-0">{children}</div>
    </section>
  )
}

export type TileSize = "up" | "big" | "poster" | "fluid"
type TileProps = Omit<Btn, "onClick"> & { item: Item; shape?: "wide" | "poster"; size?: TileSize; pct?: number; sub?: string; title?: string; always?: boolean; onOpen: () => void }

/** Card: art lifts on focus (translate+scale, soft shadow + gloss fade in by opacity); the caption fades in BELOW it only on focus (always = episodes/channels). */
export function Tile({ item, shape = "wide", size = "up", pct, sub, title, always, onOpen, className, ...p }: TileProps) {
  const fav = useApp((s) => !!s.profileId && s.data[s.profileId]?.favs.includes(item.id))
  const locked = useLocked(item)
  const live = item.kind === "live"
  const wide = shape === "wide"
  const chip = "absolute top-2 grid size-7 place-items-center rounded-full bg-black/60"
  return (
    <button data-nav data-atv-card data-id={item.id} onClick={onOpen} {...p} className={cn("atv-card", `atv-w-${size}`, className)}>
      <div className="atv-lift">
        <div className={cn("atv-art", wide ? "aspect-video" : "aspect-[2/3]", live && "bg-gradient-to-br from-surface-3 to-surface")}>
          <Logo item={wide ? wideArt(item) : item} className={cn("size-full", live ? "object-contain p-[14%]" : "object-cover")} />
          {fav && <span className={cn(chip, "end-2")}><Star className="size-4 fill-yellow-400 text-yellow-400" /></span>}
          {locked && <span className={cn(chip, "start-2")}><Lock className="size-4 text-white" /></span>}
          <SourceBadge item={item} className={cn("start-2", pct ? "bottom-3.5" : "bottom-2")} />
          {pct ? <div dir="ltr" data-ltr className="atv-bar absolute inset-x-0 bottom-0 h-1.5"><div style={{ width: `${Math.min(100, pct)}%` }} /></div> : null}
        </div>
        <span aria-hidden className="atv-glow" />
      </div>
      <div className="atv-cap" data-always={always ? "" : undefined}>
        <div dir="auto" className="truncate text-base font-semibold text-foreground">{title ?? item.name}</div>
        {sub ? <div dir="auto" className="truncate text-sm text-muted-foreground">{sub}</div> : <div className="h-5" />}
      </div>
    </button>
  )
}

/** Round person photo with name below (Cast & Crew). */
export function PersonTile({ name, role, photo, onOpen }: { name: string; role?: string; photo?: string; onOpen: () => void }) {
  return (
    <button data-nav data-atv-card onClick={onOpen} className="atv-card atv-w-person text-center">
      <div className="atv-lift !rounded-full">
        <div className="atv-art aspect-square !rounded-full">
          {photo ? <img src={photo} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <div className="grid size-full place-items-center bg-surface-2 text-3xl font-semibold">{name.slice(0, 1)}</div>}
        </div>
        <span aria-hidden className="atv-glow" />
      </div>
      <div className="atv-cap" data-always="">
        <div dir="auto" className="truncate text-base font-semibold">{name}</div>
        {role ? <div dir="auto" className="truncate text-sm text-muted-foreground">{role}</div> : <div className="h-5" />}
      </div>
    </button>
  )
}

export type Pick = { item: Item; kicker: string }

/** Full-bleed hero carousel. Slides crossfade by opacity; auto-advances only with motion=full and no focus/pointer inside. */
export function Hero({ picks, onPlay, onInfo, isFav, onFav, playLabel, tall = true }: {
  picks: Pick[]; onPlay: (i: Item) => void; onInfo?: (i: Item) => void; isFav: (i: Item) => boolean; onFav: (i: Item) => void; playLabel?: string; tall?: boolean
}) {
  const t = useT()
  const [n, setN] = useState(0)
  const [paused, setPaused] = useState(false)
  const motion = useApp((s) => s.settings.motion)
  const cur = picks[n] ?? picks[0]
  useEffect(() => setN(0), [picks])
  useEffect(() => {
    if (paused || picks.length < 2 || motion !== "full") return
    const iv = setInterval(() => { if (!document.hidden) setN((i) => (i + 1) % picks.length) }, 8000)
    return () => clearInterval(iv)
  }, [paused, picks.length, n, motion])
  if (!cur) return null
  const item = cur.item
  const meta = [item.genres?.slice(0, 2).join(", ") || item.group, item.year && fmt.digits(item.year), item.rating ? `★ ${fmt.digits(item.rating)}` : ""].filter(Boolean).join("  ·  ")
  return (
    <section data-tall={tall ? "" : undefined} className="atv-hero relative -mx-[var(--gx)] overflow-hidden"
      onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false) }}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {picks.map((f, i) => (i === n || i === (n + 1) % picks.length || i === (n + picks.length - 1) % picks.length) && ( // only neighbours are mounted (TV memory)
        <div key={f.item.id} aria-hidden data-on={i === n ? "" : undefined} className="atv-slide absolute inset-0">
          {(f.item.backdrop || f.item.logo) && <img src={f.item.backdrop || f.item.logo} alt="" className="size-full object-cover" decoding="async" />}
        </div>
      ))}
      <div className="atv-hero-shade absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-[var(--gx)] pb-[4.5rem]">
        <div key={item.id} className="m-rise flex max-w-3xl flex-col gap-3">
          <div className="atv-kicker">{cur.kicker}</div>
          <h1 dir="auto" className="atv-h1 line-clamp-2">{item.name}</h1>
          {meta ? <p dir="auto" className="text-lg text-[var(--fg-80)]">{meta}</p> : null}
          {item.plot ? <p dir="auto" className="line-clamp-1 text-lg text-[var(--fg-80)]">{item.plot}</p> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 p-1 -m-1">
          <Capsule primary onClick={() => onPlay(item)}><Play className="fill-current" />{item.kind === "live" ? t("atv.hero.watchLive") : playLabel ?? t("atv.hero.play")}</Capsule>
          <UpNextButton on={isFav(item)} onClick={() => onFav(item)} />
          {onInfo && item.kind !== "live" && <Circle label={t("atv.hero.moreInfo")} onClick={() => onInfo(item)}><Info /></Circle>}
        </div>
      </div>
      {picks.length > 1 && (
        <div role="group" aria-label={t("atv.hero.featured")} className="absolute inset-x-0 bottom-10 flex items-center justify-center">
          {picks.map((f, i) => (
            <button key={f.item.id} data-nav aria-label={t("atv.hero.featuredN", { n: i + 1, name: f.item.name })} aria-current={i === n ? "true" : undefined} onFocus={() => setN(i)} onClick={() => setN(i)} className="atv-dot grid h-8 w-7 place-items-center">
              <span />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

/** Hero-shaped placeholder + shelf placeholders (same footprints as the real thing). */
export const SkelHeroBlock = () => <div aria-hidden className="atv-hero skel -mx-[var(--gx)]" data-tall="" />
