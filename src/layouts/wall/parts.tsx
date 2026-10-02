import { useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { create } from "zustand"
import { Play } from "lucide-react"
import { Pill } from "@/components/gtv"
import { Empty, Logo, Poster, VGrid } from "@/components/tv/ui"
import { nowNext, useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { useMeta } from "@/lib/meta"
import type { Item } from "@/lib/types"

/** The title the info bar / fanart follows. Written on focus, read only by InfoBar/Fanart, so moving focus never re-renders the rows. */
const useWall = create<{ item?: Item; set: (i?: Item) => void }>((set) => ({ set: (item) => set({ item }) }))
export const useFocused = () => useWall((s) => s.item)

/** Seed the info bar with the first item whenever the list changes. */
export function useSeed(items: Item[]) {
  const set = useWall((s) => s.set)
  useEffect(() => set(items[0]), [items]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Focus handler for a container: any [data-id] element that takes focus becomes the focused title. */
export function useFollow() {
  const byId = useCatalog((s) => s.byId)
  const set = useWall((s) => s.set)
  return (e: { target: EventTarget }) => {
    const id = (e.target as HTMLElement).closest?.("[data-id]")?.getAttribute("data-id")
    const i = id ? byId.get(id) : undefined
    if (i) set(i)
  }
}

/** Filter/sort toolbar pill (Plex: orange when selected). */
export const Opt = ({ on, ...p }: ComponentProps<typeof Pill> & { on?: boolean }) => <Pill variant={on ? "primary" : "tonal"} aria-pressed={on} className="pw-opt !min-h-9 !px-4 !text-sm" {...p} />

/** Plex row hub: bold title over a horizontal poster row. */
export const Hub = ({ title, children, onSeeAll }: { title: string; children: ReactNode; onSeeAll?: () => void }) => (
  <section className="pw-hub -mx-[var(--gx)] mb-3">
    <div className="px-[var(--gx)]">
      {onSeeAll ? <button data-nav data-pill onClick={onSeeAll} className="pw-hub-title -ms-3 rounded-full px-3">{title}</button> : <h2 className="pw-hub-title">{title}</h2>}
    </div>
    <div data-nav-group className="rail rail-in !mx-0">{children}</div>
  </section>
)

export function PosterGrid({ items, pct, onOpen, empty }: { items: Item[]; pct?: (i: Item) => number | undefined; onOpen: (i: Item) => void; empty: string }) {
  const mode = useMode()
  if (!items.length) return <Empty>{empty}</Empty>
  return <VGrid items={items} minW={mode === "tv" ? 150 : mode === "mobile" ? 105 : 128} render={(i) => <Poster key={i.id} item={i} pct={pct?.(i)} onOpen={() => onOpen(i)} />} />
}

/** Kodi-style fanart behind the page: the focused title's backdrop, faded into the charcoal background. Hidden on mobile. */
export function Fanart() {
  const mode = useMode()
  const item = useFocused()
  const img = item?.backdrop
  if (mode === "mobile" || !img) return null
  return (
    <div aria-hidden className="pw-fanart">
      <img key={img} src={img} alt="" decoding="async" className="m-fade" />
    </div>
  )
}

const mins = (r: string | number | undefined, dur?: number) => {
  const s = typeof r === "number" ? r : dur
  return s ? Math.round(s / 60) : 0
}

/** Plex "inline metadata" for the focused title: name, meta line, genres, synopsis, orange Play. Live: now / next. Hidden on mobile. */
export function InfoBar({ onPlay }: { onPlay?: (i: Item) => void }) {
  const t = useT()
  const mode = useMode()
  const item = useFocused()
  const epg = useCatalog((s) => s.epg)
  useCatalog((s) => s.epgTick)
  // fetch meta only after focus has rested ~400 ms on a poster
  const [rest, setRest] = useState(item)
  useEffect(() => { const id = setTimeout(() => setRest(item), 400); return () => clearTimeout(id) }, [item])
  const { meta: m } = useMeta(mode === "mobile" ? undefined : rest, undefined, true)
  if (mode === "mobile") return null
  if (!item) return <div className="pw-info" />
  const meta = rest === item ? m : null
  const live = item.kind === "live"
  const { now, next } = live ? nowNext(epg, item.epgId) : ({} as ReturnType<typeof nowNext>)
  const rating = item.rating || meta?.ratings[0]?.value
  const min = mins(meta?.runtime, item.dur)
  const bits = [item.year ?? meta?.year, rating ? `★ ${fmt.digits(rating)}` : "", min ? t("pw.pane.min", { n: fmt.number(min) }) : "", live ? item.group : ""].filter(Boolean)
  const genres = meta?.genres.length ? meta.genres : item.genres ?? []
  const plot = meta?.plot ?? item.plot
  return (
    <div className="pw-info" aria-live="polite">
      <div className="min-w-0 flex-1">
        <h2 dir="auto" className="pw-title">{item.name}</h2>
        {(bits.length > 0 || genres.length > 0) && <div dir="auto" className="pw-meta">{[...bits, ...genres.slice(0, 3)].map((b, i) => <span key={i}>{b}</span>)}</div>}
        {live && now ? (
          <p dir="auto" className="pw-plot"><span className="font-semibold text-foreground">{t("pw.pane.now")} </span>{fmt.time(now.s)} {now.t}{next ? <> <span className="font-semibold text-foreground"> · {t("pw.pane.next")} </span>{fmt.time(next.s)} {next.t}</> : null}</p>
        ) : plot ? <p dir="auto" className="pw-plot">{plot}</p> : null}
      </div>
      {onPlay && <Pill variant="primary" onClick={() => onPlay(item)} className="pw-play"><Play className="fill-current" />{t("pw.pane.play")}</Pill>}
      {live && <Logo item={item} className="hidden size-16 shrink-0 rounded-lg p-1.5 lg:block" />}
    </div>
  )
}
