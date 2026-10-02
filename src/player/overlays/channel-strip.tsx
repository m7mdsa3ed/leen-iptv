import { memo, useEffect, useMemo, useRef, useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { groupLabel, Logo } from "@/components/tv/ui"
import { nowNext, useCatalog } from "@/lib/catalog"
import { fmt, useT } from "@/lib/i18n"
import { usePData } from "@/lib/store"
import { FAV } from "@/components/tv/groups"
import type { Item } from "@/lib/types"
import { useTick } from "../more/hooks"

const CAP = 60 // tiles mounted around the watched channel (a category can hold hundreds)
const IDLE_MS = 8000

/** Bottom mini-guide: the channels of one category as a horizontal rail. Left/Right = D-pad focus, Up/Down = previous/next category (wraps),
    OK = tune (Player.tune) and close, auto-hides after IDLE_MS without input. [data-modal] keeps the D-pad inside. */
export const ChannelStrip = memo(function ChannelStrip({ item, tune, close }: { item: Item; tune: (c: Item, list: Item[]) => void; close: () => void }) {
  const t = useT()
  useTick(30000)
  const epg = useCatalog((s) => s.epg)
  const live = useCatalog((s) => s.byKind.live)
  const realGroups = useCatalog((s) => s.groups.live)
  const favs = usePData().favs
  const hasFav = useMemo(() => live.some((c) => favs.includes(c.id)), [live, favs])
  const groups = useMemo(() => (hasFav ? [FAV, ...realGroups] : realGroups), [hasFav, realGroups])
  const [g, setG] = useState(item.group)
  const ref = useRef<HTMLElement>(null)
  const idle = useRef(0)
  const closeRef = useRef(close)
  closeRef.current = close
  const bump = () => { clearTimeout(idle.current); idle.current = window.setTimeout(() => closeRef.current(), IDLE_MS) }
  useEffect(() => { bump(); return () => clearTimeout(idle.current) }, [])

  const cat = useMemo(() => live.filter((c) => (g === FAV ? favs.includes(c.id) : c.group === g)), [live, g, favs])
  const shown = useMemo(() => {
    const ci = Math.max(0, cat.findIndex((c) => c.id === item.id))
    const a = Math.max(0, Math.min(ci - CAP / 2, cat.length - CAP))
    return cat.slice(a, a + CAP)
  }, [cat, item.id])

  // focus the watched channel (else the first tile) and centre it; re-run when the category changes (the old tile unmounted)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const r = ref.current
      const el = r?.querySelector<HTMLElement>("[data-cur]") ?? r?.querySelector<HTMLElement>("[data-stile]")
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: "nearest", inline: "center" })
    })
    return () => cancelAnimationFrame(id)
  }, [g])

  const cycle = (d: number) => {
    const i = groups.indexOf(g)
    if (groups.length > 1) setG(groups[(i + d + groups.length) % groups.length])
  }
  const at = Date.now()
  return (
    <>
      <div aria-hidden className="absolute inset-0 z-[11]" onClick={close} />
      <section
        ref={ref} data-modal data-strip role="dialog" aria-label={t("player.channels")}
        className="pl-strip pl-strip-in absolute inset-x-0 bottom-0 z-[12] px-[var(--gx)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-16"
        onKeyDown={(e) => {
          bump()
          if (e.keyCode === 38 || e.keyCode === 40) { e.preventDefault(); e.stopPropagation(); cycle(e.keyCode === 40 ? 1 : -1) }
        }}
        onPointerMove={bump} onWheel={bump}
      >
        <button tabIndex={-1} aria-label={t("player.strip.category")} onClick={() => cycle(1)} className="pl-chip mb-3">
          <ChevronsUpDown /><bdi dir="auto">{groupLabel(g, t)}</bdi>
        </button>
        <div key={g} data-nav-group className="rail !mb-0 !gap-3 !pb-3">
          {shown.map((c) => {
            const cur = c.id === item.id
            const { now } = nowNext(epg, c.epgId, at)
            return (
              <button
                key={c.id} data-nav data-pill data-stile data-cur={cur ? "" : undefined} aria-current={cur}
                style={{ "--s": 1.04 } as React.CSSProperties}
                className={`pl-tile flex w-64 shrink-0 flex-col gap-1.5 bg-surface-2 p-3 text-start text-foreground ${cur ? "pl-cur" : ""}`}
                onClick={() => (cur ? close() : tune(c, cat))}
              >
                <span className="flex items-center gap-2.5">
                  <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-surface-3"><Logo item={c} className="size-full p-1" /></span>
                  <span dir="auto" className="min-w-0 flex-1 truncate text-base">{c.num ? <bdi className="me-2 opacity-60">{fmt.number(c.num)}</bdi> : null}{c.name}</span>
                </span>
                <span dir="auto" className="block h-5 truncate text-sm opacity-70">{now?.t ?? ""}</span>
                <span dir="ltr" data-ltr className="pl-progress">
                  {now && <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, (at - now.s) / (now.e - now.s)))})` }} />}
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </>
  )
})
