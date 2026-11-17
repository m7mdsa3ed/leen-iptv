import { useEffect, useRef, useState, type TouchEvent } from "react"
import { Bookmark, BookmarkCheck, Info, Play, Tv } from "lucide-react"
import { cn } from "@/lib/utils"
import { Art, Pill, RoundButton } from "@/components/gtv"
import { fmt, useT } from "@/lib/i18n"
import { useMode } from "@/lib/device"
import { usePData } from "@/lib/store"
import { resumable } from "@/lib/progress-pure"
import type { Item } from "@/lib/types"
import type { HeroPick } from "../home-data"

const ROTATE = 9000 // ms per pick while nothing inside the stage has focus or the pointer

/** Facts under the stage title: year, rating, two genres (or the category), running time. */
export function facts(i: Item) {
  const r = i.rating && Number.isFinite(Number(i.rating)) ? fmt.decimal(Number(i.rating)) : i.rating
  return [i.year && fmt.digits(i.year), r ? `★ ${r}` : "", i.genres?.slice(0, 2).join(", ") || i.group, i.dur && i.dur > 60 ? fmt.duration(i.dur) : ""].filter(Boolean) as string[]
}

/** Two stacked images: the new one fades in over the previous one, which is dropped once covered. */
function useLayers(src: string | undefined, key: string) {
  const [layers, setLayers] = useState(() => (src ? [{ k: key, src }] : []))
  useEffect(() => {
    if (!src) return setLayers([])
    setLayers((l) => (l[l.length - 1]?.src === src ? l : [...l.slice(-1), { k: key, src }]))
    const id = setTimeout(() => setLayers((l) => l.slice(-1)), 700)
    return () => clearTimeout(id)
  }, [src, key])
  return layers
}

/**
 * Home stage: one featured title at a time, full-bleed under the top bar (backdrop, title, facts, plot, Play / More info / Watchlist),
 * with the other picks as a row of thumbnails under it. Focusing (TV) or clicking (desktop) a thumbnail shows it; OK / a second click opens it.
 * Rotates by itself while focus and the pointer are elsewhere (not with motion off). Phone: swipe or the dots.
 */
export function Stage({ picks, watch, info, isFav, toggleFav }: { picks: HeroPick[]; watch: (i: Item) => void; info: (i: Item) => void; isFav: (i: Item) => boolean; toggleFav: (i: Item) => void }) {
  const t = useT()
  const mobile = useMode() === "mobile"
  const { progress } = usePData()
  const [curId, setCurId] = useState<string>()
  const [hold, setHold] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const touch = useRef(0)
  const n = picks.length
  // tracked by id: a watchlist toggle can reorder the picks, and the title under focus must not change with it
  const idx = Math.max(0, picks.findIndex((x) => x.item.id === curId))
  const setCur = (i: number) => setCurId(picks[i]?.item.id)
  const pick = picks[idx]
  const item = pick?.item
  const back = item?.backdrop
  const layers = useLayers(back, item?.id ?? "")

  // auto-advance; any focus or hover inside holds it, so nothing changes under the user
  useEffect(() => {
    if (hold || n < 2) return
    const id = window.setTimeout(() => {
      if (document.documentElement.dataset.motion === "off" || document.hidden || !ref.current?.offsetParent) return // still, or on a page stacked under another
      setCurId(picks[(idx + 1) % n].item.id)
    }, ROTATE)
    return () => clearTimeout(id)
  }, [idx, hold, n, picks])
  // warm the next backdrop so the crossfade never shows an empty frame
  useEffect(() => { const nb = picks[(idx + 1) % n]?.item.backdrop; if (nb && n > 1) new Image().src = nb }, [idx, n, picks])

  if (!item) return null
  const p = progress[item.id]
  const resume = resumable(p) && !p.next
  const left = resume ? Math.max(1, Math.ceil((p.dur - p.pos) / 60)) : 0
  const live = item.kind === "live"
  const fav = isFav(item)
  const f = facts(item)
  const main = live ? t("gtv.home.watchLive") : resume ? t("gtv.home.resume") : item.kind === "series" ? t("gtv.home.episodes") : t("common.play")
  const go = (d: number) => setCur((idx + d + n) % n)
  const onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touch.current
    if (Math.abs(dx) < 48 || n < 2) return
    go((dx < 0) !== (document.documentElement.dir === "rtl") ? 1 : -1) // swipe towards the start = next
  }

  return (
    <section
      ref={ref}
      aria-roledescription="carousel"
      aria-label={t("gtv.home.stage")}
      onFocus={(e) => {
        setHold(true)
        const sc = ref.current?.parentElement // D-pad / keyboard back on the stage = the whole stage on screen, not just the focused row
        if (sc && sc.scrollTop > 0 && e.target.matches(":focus-visible")) sc.scrollTo({ top: 0 })
      }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHold(false) }}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHold(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !ref.current?.contains(document.activeElement) && setHold(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={onTouchEnd}
      className="gtv-stage relative -ms-[var(--gs)] -me-[var(--gx)] mb-2 flex flex-col justify-end overflow-hidden"
    >
      {/* artwork: backdrop crossfade, else the poster / logo framed beside the text on a tinted ground */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-accent-blue-container via-surface to-background">
        <div className="gtv-stage-art absolute inset-0">
          {layers.map((l, i) => (
            <img key={l.k} src={l.src} alt="" decoding="async" className={cn("absolute inset-0 size-full object-cover object-top", i > 0 && "m-fade")} />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background/95 via-background/60 to-transparent md:block rtl:bg-gradient-to-l" />
      </div>
      {!back && !mobile && (
        <div key={item.id} aria-hidden className={cn("m-fade absolute end-[var(--gx)] top-[calc(var(--content-t)+1rem)] hidden md:block", live ? "w-[min(30vw,24rem)]" : "w-[min(17vw,14rem)]")}>
          <Art item={item} variant={live ? "wide" : "poster"} className="w-full rounded-2xl shadow-2xl ring-1 ring-[var(--fg-10)]" />
        </div>
      )}

      <div key={item.id} className="m-rise relative flex max-w-[min(100%,46rem)] flex-col gap-3 ps-[var(--gs)] pe-[var(--gx)] pt-[calc(var(--content-t)+1.5rem)]">
        <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-accent-blue">
          <span aria-hidden className="size-1.5 rounded-full bg-accent-blue" />{pick.kicker}
        </span>
        <h2 dir="auto" className="line-clamp-2 text-3xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl xl:text-6xl">{item.name}</h2>
        {f.length > 0 && (
          <div dir="auto" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base text-foreground/80">
            {f.map((x, i) => <span key={i} className="inline-flex items-center gap-2.5">{i > 0 && <span aria-hidden className="opacity-40">•</span>}{x}</span>)}
          </div>
        )}
        {resume && (
          <div className="flex items-center gap-3 text-sm text-foreground/80">
            <div dir="ltr" className="h-1 w-32 overflow-hidden rounded-full bg-[var(--fg-30)]"><div className="h-full bg-accent-blue" style={{ width: `${(p.pos / p.dur) * 100}%` }} /></div>
            {fmt.plural("gtv.minLeft", left)}
          </div>
        )}
        {item.plot && <p dir="auto" className="line-clamp-2 max-w-2xl text-base leading-relaxed text-foreground/75 md:line-clamp-3 md:text-lg">{item.plot}</p>}
        <div className="-ms-1 mt-2 flex flex-wrap items-center gap-3 p-1">
          <Pill variant="primary" onClick={() => watch(item)} className="min-h-12 px-7">{live ? <Tv /> : <Play className="fill-current" />}{main}</Pill>
          {!live && <Pill onClick={() => info(item)} className="min-h-12"><Info />{t("common.moreInfo")}</Pill>}
          <RoundButton label={t(fav ? "gtv.home.removeWatchlist" : "gtv.home.addWatchlist")} aria-pressed={fav} active={fav} onClick={() => toggleFav(item)}>
            {fav ? <BookmarkCheck className="text-accent-blue" /> : <Bookmark />}
          </RoundButton>
        </div>
      </div>

      {n > 1 && (mobile ? (
        <div role="tablist" aria-label={t("gtv.home.stage")} className="relative flex justify-center gap-0.5 ps-[var(--gs)] pe-[var(--gx)] pb-2 pt-4">
          {picks.map((x, i) => (
            <button key={x.item.id} role="tab" aria-selected={i === idx} aria-label={x.item.name} onClick={() => setCur(i)} className="grid h-6 min-w-6 place-items-center">
              <span className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", i === idx ? "w-5 bg-foreground" : "w-1.5 bg-[var(--fg-30)]")} />
            </button>
          ))}
        </div>
      ) : (
        <div data-nav-group="memory" role="tablist" aria-label={t("gtv.home.stage")} className="rail !mx-0 relative mt-4">
          {picks.map((x, i) => (
            <button key={x.item.id} data-nav data-card role="tab" aria-selected={i === idx} aria-label={x.item.name}
              onFocus={() => setCur(i)} onClick={() => (i === idx ? (x.item.kind === "live" ? watch(x.item) : info(x.item)) : setCur(i))}
              className="gtv-thumb block w-44 shrink-0 text-start lg:w-52">
              <div data-tilewrap className="relative rounded-xl">
                <Art item={x.item} variant="wide" data-tile className="rounded-[inherit]">
                  {i === idx && !hold && <span aria-hidden key={idx} className="gtv-tick absolute inset-x-0 bottom-0 h-1 bg-accent-blue" />}
                </Art>
                <span data-ring aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" />
              </div>
              <div dir="auto" className="mt-2 truncate px-0.5 text-sm text-foreground">{x.item.name}</div>
            </button>
          ))}
        </div>
      ))}
    </section>
  )
}

/** Same footprint as the Stage, while the catalog loads. */
export function SkelStage() {
  return (
    <section aria-hidden className="gtv-stage relative -ms-[var(--gs)] -me-[var(--gx)] mb-2 flex flex-col justify-end">
      <div className="flex flex-col gap-4 ps-[var(--gs)] pe-[var(--gx)]">
        <div className="skel h-4 w-32 rounded-full" />
        <div className="skel h-12 w-[min(80%,30rem)] rounded-2xl" />
        <div className="skel h-4 w-60 rounded-full" />
        <div className="skel h-4 w-[min(90%,36rem)] rounded-full" />
        <div className="mt-2 flex gap-3"><div className="skel h-12 w-36 rounded-full" /><div className="skel h-12 w-36 rounded-full" /></div>
      </div>
      <div className="rail !mx-0 mt-4 overflow-hidden">{Array.from({ length: 5 }, (_, i) => <div key={i} className="skel aspect-video w-44 shrink-0 rounded-xl lg:w-52" />)}</div>
    </section>
  )
}
