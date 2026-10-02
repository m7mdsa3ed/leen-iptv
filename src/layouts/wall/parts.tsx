import { useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { create } from "zustand"
import { Pill } from "@/components/gtv"
import { Empty, Logo, Poster, VGrid } from "@/components/tv/ui"
import { nowNext, useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { useMeta } from "@/lib/meta"
import type { Item } from "@/lib/types"

/** The poster the detail pane follows. Written on focus, read only by Pane, so moving focus never re-renders the grid. */
const useWall = create<{ item?: Item; set: (i?: Item) => void }>((set) => ({ set: (item) => set({ item }) }))

/** Seed the pane with the first item whenever the list changes. */
export function useSeed(items: Item[]) {
  const set = useWall((s) => s.set)
  useEffect(() => set(items[0]), [items]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Small toggle pill for the filter rows. */
export const Opt = ({ on, ...p }: ComponentProps<typeof Pill> & { on?: boolean }) => <Pill variant={on ? "primary" : "tonal"} aria-pressed={on} className="!min-h-9 !px-4 !text-sm" {...p} />

/** ~70% left column (filter bar + body) and the persistent detail pane. Focus on any [data-id] element inside feeds the pane. */
export function Split({ bar, children }: { bar: ReactNode; children: ReactNode }) {
  const byId = useCatalog((s) => s.byId)
  const set = useWall((s) => s.set)
  return (
    <div className="pw-split">
      <section className="pw-left" onFocus={(e) => { const id = (e.target as HTMLElement).closest?.("[data-id]")?.getAttribute("data-id"); const i = id ? byId.get(id) : undefined; if (i) set(i) }}>
        <div className="pw-bar">{bar}</div>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
      <Pane />
    </div>
  )
}

export function PosterGrid({ items, pct, onOpen, empty }: { items: Item[]; pct?: (i: Item) => number | undefined; onOpen: (i: Item) => void; empty: string }) {
  const mode = useMode()
  useSeed(items)
  if (!items.length) return <Empty>{empty}</Empty>
  return <VGrid items={items} minW={mode === "tv" ? 150 : mode === "mobile" ? 105 : 128} render={(i) => <Poster key={i.id} item={i} pct={pct?.(i)} onOpen={() => onOpen(i)} />} />
}

const mins = (r: string | number | undefined, dur?: number) => {
  const s = typeof r === "number" ? r : dur
  return s ? Math.round(s / 60) : 0
}

export function Pane() {
  const t = useT()
  const mode = useMode()
  const item = useWall((s) => s.item)
  const epg = useCatalog((s) => s.epg)
  useCatalog((s) => s.epgTick)
  // fetch meta only after focus has rested ~400 ms on a poster
  const [rest, setRest] = useState(item)
  useEffect(() => { const id = setTimeout(() => setRest(item), 400); return () => clearTimeout(id) }, [item])
  const { meta: m } = useMeta(mode === "mobile" ? undefined : rest, undefined, true)
  if (mode === "mobile") return null
  if (!item) return <aside className="pw-pane"><div className="pw-body text-muted-foreground">{t("pw.pane.empty")}</div></aside>
  const meta = rest === item ? m : null
  const live = item.kind === "live"
  const { now, next } = live ? nowNext(epg, item.epgId) : ({} as ReturnType<typeof nowNext>)
  const rating = item.rating || meta?.ratings[0]?.value
  const min = mins(meta?.runtime, item.dur)
  const bits = [item.year ?? meta?.year, rating ? `★ ${fmt.digits(rating)}` : "", min ? t("pw.pane.min", { n: fmt.number(min) }) : "", live ? item.group : ""].filter(Boolean)
  const genres = meta?.genres.length ? meta.genres : item.genres ?? []
  const plot = meta?.plot ?? item.plot
  const cast = meta?.cast.slice(0, 8).map((c) => c.name).join(" · ")
  const img = meta?.backdrop ?? item.backdrop
  return (
    <aside className="pw-pane" aria-live="polite">
      {img && <img key={img} src={img} alt="" aria-hidden decoding="async" className="pw-pane-img" />}
      <div aria-hidden className="pw-pane-fade" />
      <div className="pw-body">
        {live && <Logo item={item} className="mb-3 size-20 rounded-xl p-2" />}
        <h2 dir="auto" className="pw-title">{item.name}</h2>
        {bits.length > 0 && <div dir="auto" className="pw-meta">{bits.map((b, i) => <span key={i}>{b}</span>)}</div>}
        {genres.length > 0 && <div className="flex flex-wrap gap-2">{genres.slice(0, 4).map((g) => <span key={g} dir="auto" className="pw-chip">{g}</span>)}</div>}
        {live && now && (
          <div className="flex flex-col gap-1 text-base">
            <div dir="auto"><span className="text-muted-foreground">{t("pw.pane.now")} </span>{fmt.time(now.s)} {now.t}</div>
            {now.d ? <p dir="auto" className="line-clamp-3 text-sm text-muted-foreground">{now.d}</p> : null}
            {next && <div dir="auto"><span className="text-muted-foreground">{t("pw.pane.next")} </span>{fmt.time(next.s)} {next.t}</div>}
          </div>
        )}
        {!live && plot ? <p dir="auto" className="pw-plot">{plot}</p> : null}
        {cast ? <div dir="auto" className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{t("pw.pane.cast")}: </span>{cast}</div> : null}
        <div aria-hidden className="pw-hint">▶ {t(live ? "pw.pane.hintLive" : "pw.pane.hint")}</div>
      </div>
    </aside>
  )
}
