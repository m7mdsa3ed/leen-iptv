import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { create } from "zustand"
import { List, ListPlus, Lock, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { isTv, useMode } from "@/lib/device"
import { focusFirst, useRoute } from "@/lib/nav"
import { useApp, useLists, useProfile } from "@/lib/store"
import { openListModal } from "./lists"
import { CARD_K } from "@/lib/cards"
import { Card, Pill, SkelGrid, SkelRail } from "@/components/gtv"
import { useLayoutDef } from "@/layouts"
import { useCatalog } from "@/lib/catalog"
import { fmt, useT, type TFn } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { tileName } from "@/lib/logos-pure"

/* ---------- PIN gate ---------- */
export const usePinAsk = create<{ ask: null | { pin: string; resolve: (ok: boolean) => void } }>(() => ({ ask: null }))
export const askPin = (pin: string) => new Promise<boolean>((resolve) => usePinAsk.setState({ ask: { pin, resolve } }))

export function PinModal() {
  const t = useT()
  const ask = usePinAsk((s) => s.ask)
  const [v, setV] = useState("")
  const [bad, setBad] = useState(false)
  const done = (ok: boolean) => (ask?.resolve(ok), usePinAsk.setState({ ask: null }), setV(""))
  const press = (d: string) => {
    if (!ask) return
    const n = (v + d).slice(0, 4)
    setBad(false)
    if (n.length < 4) return setV(n)
    if (n === ask.pin) done(true)
    else (setV(""), setBad(true))
  }
  useEffect(() => {
    if (!ask) return
    requestAnimationFrame(focusFirst)
    const k = (e: KeyboardEvent) => /^[0-9]$/.test(e.key) && press(e.key)
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  })
  if (!ask) return null
  return (
    <div data-modal className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-auto w-full max-w-[26rem] rounded-[28px] bg-surface p-6 text-center shadow-2xl sm:p-8">
        <Lock className="mx-auto mb-3 size-8" />
        <div className="text-2xl font-semibold">{t("nav.pin.title")}</div>
        <div className={cn("my-5 h-8 text-3xl tracking-[0.6em]", bad && "text-destructive")}>{bad ? t("nav.pin.wrong") : "•".repeat(v.length) || " "}</div>
        <div dir="ltr" className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Pill key={d} className="h-14 text-2xl" onClick={() => press(d)}>{d}</Pill>
          ))}
          <Pill variant="ghost" className="h-14 px-2" onClick={() => done(false)}>{t("common.cancel")}</Pill>
          <Pill className="h-14 text-2xl" onClick={() => press("0")}>0</Pill>
          <Pill variant="ghost" className="h-14 px-2" onClick={() => setV(v.slice(0, -1))}>{t("common.del")}</Pill>
        </div>
      </div>
    </div>
  )
}

/* ---------- primitives ---------- */
export function TvButton({ className, ...p }: React.ComponentProps<typeof Button>) {
  return <Button data-nav data-pill {...p} className={cn("h-12 min-h-11 rounded-full px-6 text-base font-medium", className)} />
}

/** Display name of a group chip: the FAV / ALL pseudo groups are localised, real categories are shown as-is. (FAV/ALL live in groups.tsx; literals here avoid an import cycle.) */
export const groupLabel = (g: string, t: TFn) => (g === "Favorites" ? t("common.favorites") : g === "All" ? t("common.all") : g === "Other" ? t("common.other") : g)

/** Category lists can be shown as a start-side sidebar (Settings > Display > Categories): marks the page content so CSS reserves room for it. */
export function useCatSide() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const m = ref.current?.closest<HTMLElement>("[data-page-content]")
    m?.setAttribute("data-cats", "")
    return () => m?.removeAttribute("data-cats")
  }, [])
  return ref
}

export function Chips({ items, active, onPick, locked, onKey, onCtx, cat, liveLists }: { cat?: boolean; items: string[]; active: string; onPick: (g: string) => void; locked?: (g: string) => boolean; onKey?: (e: React.KeyboardEvent, g: string) => void; onCtx?: (e: React.MouseEvent, g: string) => void; liveLists?: boolean }) {
  const t = useT()
  const lists = useLists()
  const isList = (g: string) => lists.some((l) => l.name === g)
  const ref = useCatSide()
  const row = (
    <div data-nav-group className="rail !mb-0 !gap-3 !pb-2">
      {items.map((g) => (
        <button
          key={g}
          data-nav
          data-pill
          aria-pressed={g === active}
          onClick={() => onPick(g)}
          onKeyDown={onKey && ((e) => onKey(e, g))}
          onContextMenu={onCtx && ((e) => onCtx(e, g))}
          className={cn("flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-5 py-2 text-base", g === active ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")}
        >
          {g === "Favorites" && <Star className="size-4" />}
          {isList(g) && <List className="size-4" />}
          {locked?.(g) && <Lock className="size-4" />}
          <bdi>{groupLabel(g, t)}</bdi>
        </button>
      ))}
      {liveLists && (
        <button data-nav data-pill onClick={() => openListModal()} className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-surface-2 px-5 py-2 text-base text-foreground/80">
          <ListPlus className="size-4" /><bdi>{t("nav.lists.new")}</bdi>
        </button>
      )}
    </div>
  )
  return cat ? <div ref={ref} className="cat-side">{row}</div> : row
}

/** Channel logo / poster: `logo`, then `logoAlt` when that link is dead, then a name tile. */
export function Logo({ item, className }: { item: Item; className?: string }) {
  const [n, setN] = useState(0)
  useEffect(() => setN(0), [item.logo, item.logoAlt])
  const src = [item.logo, item.logoAlt].filter(Boolean)[n]
  return src ? (
    <img key={src} src={src} alt="" loading="lazy" decoding="async" onError={() => setN(n + 1)} className={cn("object-contain", className)} />
  ) : <NameTile item={item} className={className} />
}

const hue = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 360 }

/** No logo: the cleaned name as a wordmark on a colour of its brand (every beIN channel the same), the channel number large. SVG text scales with any tile size. */
function NameTile({ item, className }: { item: Item; className?: string }) {
  const { title, num, brand } = tileName(item.name)
  const h = hue(brand)
  const live = item.kind === "live"
  const W = live ? 160 : 100, H = live ? 90 : 150
  // two lines at most, split near the middle word boundary
  const words = title.split(" ")
  let lines = [title]
  if (title.length > (live ? 12 : 9) && words.length > 1) {
    let best = 1
    for (let i = 1; i < words.length; i++) if (Math.abs(words.slice(0, i).join(" ").length * 2 - title.length) < Math.abs(words.slice(0, best).join(" ").length * 2 - title.length)) best = i
    lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")]
  }
  const longest = Math.max(...lines.map((l) => l.length))
  const f = Math.min(live ? 26 : 20, (W - 20) / (longest * 0.6)) // ~0.6em per glyph
  const block = lines.length * f * 1.1 + (num ? f * 1.4 : 0)
  const top = (H - block) / 2 + f * 0.9
  return (
    <div className={cn("overflow-hidden", className)} style={{ background: `linear-gradient(135deg, hsl(${h} 50% 34%), hsl(${(h + 35) % 360} 55% 16%))` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="size-full" aria-hidden fill="#fff" fontWeight={700} textAnchor="middle">
        {lines.map((l, i) => <text key={i} x={W / 2} y={top + i * f * 1.1} fontSize={f}>{l}</text>)}
        {num && <text x={W / 2} y={top + lines.length * f * 1.1 + f * 0.95} fontSize={Math.min(f * 1.6, 34)} fillOpacity={0.9}>{num}</text>}
      </svg>
    </div>
  )
}

export const Poster = ({ item, pct, onOpen, onFocus }: { item: Item; pct?: number; onOpen: () => void; onFocus?: () => void }) => (
  <Card fluid item={item} pct={pct} onOpen={onOpen} onFocus={onFocus} />
)

export function useLocked(item: Item) {
  const p = useProfile()
  return !!p?.pin && p.locked.includes(`${item.kind}|${item.group}`)
}

/** Open an item, asking for the PIN first if its category is locked. */
export function useOpen() {
  const go = useRoute((s) => s.go)
  const p = useProfile()
  return async (item: Item, queue?: Item[]) => {
    if (p?.pin && p.locked.includes(`${item.kind}|${item.group}`) && !(await askPin(p.pin))) return
    // the zapping list must contain the channel, otherwise indexOf is -1 and the player would start the first channel of the list
    const q = queue?.includes(item) ? queue : [item]
    if (item.kind === "live") go("player", { queue: q, index: q.indexOf(item) })
    else go("detail", { id: item.id })
  }
}

/* ---------- virtualised layouts ---------- */
/** TV text scale (Settings > Display). Pixel-sized layouts authored for the 20px base multiply by this. */
export const useK = () => useApp((s) => (isTv ? s.settings.tvScale : 1))

/** `head` scrolls with the grid (above the first row); `className` extends the scroller (e.g. under the mobile top bar). */
export function VGrid<T>({ items, cols, minW, ratio = 1.5, label = 64, render, head, className }: { items: T[]; cols?: number; minW?: number; ratio?: number; label?: number; render: (t: T) => ReactNode; head?: ReactNode; className?: string }) {
  const mode = useMode()
  minW ??= mode === "tv" ? 190 : mode === "mobile" ? 110 : 170
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(1500)
  useLayoutEffect(() => {
    const el = ref.current!
    const f = () => {
      const cs = getComputedStyle(el)
      setW(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || 1500) // inner width, minus the --gx padding
    }
    f()
    const ro = new ResizeObserver(f)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const k = useK()
  const ck = CARD_K[useApp((s) => s.settings.cardSize) ?? "normal"]
  const gap = isTv ? 24 * k : mode === "mobile" ? 12 : 16
  const c = cols ?? Math.max(1, Math.floor((w + gap) / (minW * ck + gap)))
  const rowH = Math.round(((w - gap * (c - 1)) / c) * ratio + label * k) + gap
  const rows = Math.ceil(items.length / c)
  const headRef = useRef<HTMLDivElement>(null)
  const [hh, setHh] = useState(0)
  useLayoutEffect(() => {
    const el = headRef.current
    if (!el) return setHh(0)
    const f = () => setHh(el.offsetHeight)
    f()
    const ro = new ResizeObserver(f)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!head]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = useVirtualizer({ count: rows, getScrollElement: () => ref.current, estimateSize: () => rowH, overscan: 3, scrollMargin: hh })
  useEffect(() => v.measure(), [rowH, v])
  return (
    <div ref={ref} data-vscroll data-under className={cn("-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] pb-6 pt-4", className)}>
      {head && <div ref={headRef}>{head}</div>}
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((r) => (
          <div key={r.key} className="absolute inset-x-0 grid" style={{ top: r.start - hh, gap, gridTemplateColumns: `repeat(${c}, minmax(0, 1fr))` }}>
            {items.slice(r.index * c, r.index * c + c).map(render)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function VList<T>({ items, rowH: baseH, render, head, className }: { items: T[]; rowH: number; render: (t: T, i: number) => ReactNode; head?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const rowH = baseH * useK()
  const headRef = useRef<HTMLDivElement>(null)
  const [hh, setHh] = useState(0)
  useLayoutEffect(() => {
    const el = headRef.current
    if (!el) return setHh(0)
    const f = () => setHh(el.offsetHeight)
    f()
    const ro = new ResizeObserver(f)
    ro.observe(el)
    return () => ro.disconnect()
  }, [!!head]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = useVirtualizer({ count: items.length, getScrollElement: () => ref.current, estimateSize: () => rowH, overscan: 8, scrollMargin: hh })
  useEffect(() => v.measure(), [rowH, v])
  return (
    <div ref={ref} data-vscroll data-under className={cn("h-full overflow-y-auto [--s:1.025]", className)}>
      {head && <div ref={headRef}>{head}</div>}
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((r) => (
          <div key={r.key} className="absolute inset-x-0 px-5" style={{ top: r.start - hh, height: rowH }}>
            {render(items[r.index], r.index)}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- shell ---------- */
export function Clock() {
  const [now, setNow] = useState(new Date())
  useT() // re-render on language switch
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i) }, [])
  return <>{fmt.time(now)}</>
}

/** Delegates to the active layout (src/layouts). */
export function Shell(p: { page: string; title?: string; children: ReactNode }) {
  const L = useLayoutDef().Shell
  return <L {...p} />
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full items-center justify-center text-xl text-muted-foreground">{children}</div>
)

/** Wait a frame or two for lists to render, then focus the first target. */
export const focusFirstSoon = () => { requestAnimationFrame(() => requestAnimationFrame(focusFirst)) }

/** Catalog not ready: show progress, or the reason it failed with a retry. */
export function Pending({ shape = "rails" }: { shape?: "rails" | "grid" }) {
  const { status, msg } = useCatalog()
  const t = useT()
  if (status !== "error")
    return (
      <div role="status" className="h-full overflow-hidden pt-2">
        <div className="mb-3 text-base text-muted-foreground">{msg ? `${msg}...` : t("common.loading")}</div>
        {shape === "grid" ? <SkelGrid variant="wide" /> : <><SkelRail variant="wide" /><SkelRail /><SkelRail /></>}
      </div>
    )
  return (
    <Empty>
      <div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center">
        <div className="text-destructive">{msg}</div>
        <Pill variant="primary" onClick={() => { const c = useCatalog.getState(); for (const id in c.sources) if (c.sources[id].status === "error") void c.retry(id) }}>{t("common.retry")}</Pill>
      </div>
    </Empty>
  )
}
