import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { create } from "zustand"
import { Lock, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { isTv, useMode } from "@/lib/device"
import { focusFirst, useRoute } from "@/lib/nav"
import { useApp, useProfile } from "@/lib/store"
import { Card, SkelGrid, SkelRail } from "@/components/gtv"
import { useLayoutDef } from "@/layouts"
import { useCatalog } from "@/lib/catalog"
import type { Item } from "@/lib/types"

/* ---------- PIN gate ---------- */
export const usePinAsk = create<{ ask: null | { pin: string; resolve: (ok: boolean) => void } }>(() => ({ ask: null }))
export const askPin = (pin: string) => new Promise<boolean>((resolve) => usePinAsk.setState({ ask: { pin, resolve } }))

export function PinModal() {
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
      <div className="my-auto w-full max-w-[26rem] rounded-[28px] bg-surface-2 p-6 text-center shadow-2xl sm:p-8">
        <Lock className="mx-auto mb-3 size-8" />
        <div className="text-2xl font-semibold">Enter PIN</div>
        <div className={cn("my-5 h-8 text-3xl tracking-[0.6em]", bad && "text-destructive")}>{bad ? "Wrong PIN" : "•".repeat(v.length) || " "}</div>
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <TvButton key={d} variant="secondary" className="h-14 rounded-2xl bg-surface-3 text-2xl" onClick={() => press(d)}>{d}</TvButton>
          ))}
          <TvButton variant="ghost" className="h-14 text-base" onClick={() => done(false)}>Cancel</TvButton>
          <TvButton variant="secondary" className="h-14 rounded-2xl bg-surface-3 text-2xl" onClick={() => press("0")}>0</TvButton>
          <TvButton variant="ghost" className="h-14 text-base" onClick={() => setV(v.slice(0, -1))}>Del</TvButton>
        </div>
      </div>
    </div>
  )
}

/* ---------- primitives ---------- */
export function TvButton({ className, ...p }: React.ComponentProps<typeof Button>) {
  return <Button data-nav data-pill {...p} className={cn("h-12 min-h-11 rounded-full px-6 text-base font-medium", className)} />
}

export function Chips({ items, active, onPick, locked, onKey, onCtx }: { items: string[]; active: string; onPick: (g: string) => void; locked?: (g: string) => boolean; onKey?: (e: React.KeyboardEvent, g: string) => void; onCtx?: (e: React.MouseEvent, g: string) => void }) {
  return (
    <div className="rail !mb-0 !gap-3 !pb-2">
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
          {locked?.(g) && <Lock className="size-4" />}
          {g}
        </button>
      ))}
    </div>
  )
}

export function Logo({ item, className }: { item: Item; className?: string }) {
  const [bad, setBad] = useState(false)
  useEffect(() => setBad(false), [item.logo])
  return item.logo && !bad ? (
    <img src={item.logo} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} className={cn("object-contain", className)} />
  ) : (
    <div className={cn("flex items-center justify-center bg-gradient-to-br from-accent-blue-container to-surface-2 text-2xl font-bold text-foreground", className)}>
      {item.name.slice(0, 2).toUpperCase()}
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

export function VGrid<T>({ items, cols, minW, ratio = 1.5, label = 64, render }: { items: T[]; cols?: number; minW?: number; ratio?: number; label?: number; render: (t: T) => ReactNode }) {
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
  const gap = isTv ? 24 * k : mode === "mobile" ? 12 : 16
  const c = cols ?? Math.max(1, Math.floor((w + gap) / (minW + gap)))
  const rowH = Math.round(((w - gap * (c - 1)) / c) * ratio + label * k) + gap
  const rows = Math.ceil(items.length / c)
  const v = useVirtualizer({ count: rows, getScrollElement: () => ref.current, estimateSize: () => rowH, overscan: 3 })
  useEffect(() => v.measure(), [rowH, v])
  return (
    <div ref={ref} data-vscroll className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] pb-6 pt-4">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((r) => (
          <div key={r.key} className="absolute inset-x-0 grid" style={{ top: r.start, gap, gridTemplateColumns: `repeat(${c}, minmax(0, 1fr))` }}>
            {items.slice(r.index * c, r.index * c + c).map(render)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function VList<T>({ items, rowH: baseH, render, className }: { items: T[]; rowH: number; render: (t: T, i: number) => ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const rowH = baseH * useK()
  const v = useVirtualizer({ count: items.length, getScrollElement: () => ref.current, estimateSize: () => rowH, overscan: 8 })
  useEffect(() => v.measure(), [rowH, v])
  return (
    <div ref={ref} data-vscroll className={cn("h-full overflow-y-auto [--s:1.025]", className)}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((r) => (
          <div key={r.key} className="absolute inset-x-0 px-5" style={{ top: r.start, height: rowH }}>
            {render(items[r.index], r.index)}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- shell ---------- */
export function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setT(new Date()), 15000); return () => clearInterval(i) }, [])
  return <>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
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
  if (status !== "error")
    return (
      <div role="status" className="h-full overflow-hidden pt-2">
        <div className="mb-3 text-base text-muted-foreground">{msg || "Loading"}...</div>
        {shape === "grid" ? <SkelGrid variant="wide" /> : <><SkelRail variant="wide" /><SkelRail /><SkelRail /></>}
      </div>
    )
  return (
    <Empty>
      <div className="flex max-w-xl flex-col items-center gap-4 px-6 text-center">
        <div className="text-destructive">{msg}</div>
        <TvButton onClick={() => { const c = useCatalog.getState(); for (const id in c.sources) if (c.sources[id].status === "error") void c.retry(id) }}>Retry</TvButton>
      </div>
    </Empty>
  )
}
