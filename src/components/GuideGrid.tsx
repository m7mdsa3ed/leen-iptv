import { memo, useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ALL, FAV } from "@/components/tv/groups"
import { Chips, Logo, Pending, useK } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { useCatalog } from "@/lib/catalog"
import { fmt, useT } from "@/lib/i18n"
import { usePData } from "@/lib/store"
import type { Item, Prog } from "@/lib/types"

const HOURS = 12

/**
 * The time-based programme guide (channels x time). Used by the Guide page and, full screen, over live playback.
 * onOpen(channel, list) is called when a programme/channel is picked. `current` = the channel being watched: the grid starts in its
 * category, scrolled to its row, and marks it (its on-now cell carries data-cur). `onClose` adds a close button on mobile.
 * Embedded use: `className` goes on the root, `onFocusProg` reports the focused programme (null = no guide data); keep both stable (memo).
 */
export const GuideGrid = memo(function GuideGrid({ onOpen, current, onClose, className = "", onFocusProg }: { onOpen: (ch: Item, list: Item[]) => void; current?: Item; onClose?: () => void; className?: string; onFocusProg?: (ch: Item, p: Prog | null) => void }) {
  const { byKind, groups, status, epg } = useCatalog()
  const d = usePData()
  const mob = useMode() === "mobile"
  const k = useK()
  const t = useT()
  const hm = (n: number) => fmt.time(n)
  const PPM = mob ? 4 : 6 * k // px per minute
  const CH_W = mob ? 128 : 260 * k
  const ROW = mob ? 56 : 80 * k
  const [g, setG] = useState(current && groups.live.includes(current.group) ? current.group : ALL)
  const ref = useRef<HTMLDivElement>(null)
  const start = useMemo(() => Math.floor((Date.now() - 3600_000) / 1800_000) * 1800_000, [])
  const end = start + HOURS * 3600_000
  const px = (t: number) => ((Math.min(Math.max(t, start), end) - start) / 60000) * PPM
  const items = useMemo(() => (g === ALL ? byKind.live : g === FAV ? byKind.live.filter((i) => d.favs.includes(i.id)) : byKind.live.filter((i) => i.group === g)), [g, byKind, d.favs])
  const v = useVirtualizer({ count: items.length, getScrollElement: () => ref.current, estimateSize: () => ROW, overscan: 6 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollLeft = px(Date.now()) - 120
    const i = current ? items.findIndex((c) => c.id === current.id) : -1
    if (i > 0) el.scrollTop = Math.max(0, i * ROW - ROW * 2) // start near the channel being watched
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  const width = CH_W + HOURS * 60 * PPM

  return (
    <>
      {status !== "ready" ? <Pending /> : (
        <div className={`flex h-full flex-col ${className}`}>
          <div className="flex items-center gap-2">
            {mob && onClose && <button aria-label={t("pages.guide.close")} onClick={onClose} className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2"><X className="size-5" /></button>}
            <div className="min-w-0 flex-1"><Chips items={[FAV, ALL, ...groups.live]} active={g} onPick={setG} /></div>
          </div>
          <div ref={ref} dir="ltr" data-ltr data-vscroll className="mt-1 min-h-0 flex-1 overflow-auto rounded-3xl bg-surface" style={{ scrollPaddingLeft: CH_W + 8, scrollPaddingTop: 48 * k }}>
            <div style={{ width, position: "relative" }}>
              <div className="sticky top-0 z-20 h-10 border-b border-border bg-surface" style={{ width }}>
                {Array.from({ length: HOURS * 2 }, (_, i) => (
                  <div key={i} className="absolute top-2 text-sm text-muted-foreground" style={{ left: CH_W + i * 30 * PPM }}>{hm(start + i * 1800_000)}</div>
                ))}
                <div className="sticky left-0 z-10 h-full bg-surface" style={{ width: CH_W }} />
              </div>
              <div style={{ height: v.getTotalSize(), position: "relative" }}>
                {v.getVirtualItems().map((r) => {
                  const ch = items[r.index]
                  const progs = (ch.epgId && epg.get(ch.epgId)) || []
                  const vis = progs.filter((p) => p.e > start && p.s < end)
                  return (
                    <div key={r.key} className={`absolute left-0 border-b border-border ${current?.id === ch.id ? "bg-surface-2" : ""}`} style={{ top: r.start, height: ROW, width }}>
                      <div className={`sticky left-0 z-10 flex h-full items-center bg-surface ${mob ? "gap-2 px-2" : "gap-3 px-3"}`} style={{ width: CH_W }}>
                        <Logo item={ch} className={`shrink-0 rounded-lg ${mob ? "size-7" : "size-10"}`} />
                        <span dir="auto" className={`line-clamp-2 min-w-0 leading-tight ${mob ? "text-xs" : "text-base"}`}>{ch.name}</span>
                      </div>
                      {(vis.length ? vis : [{ s: start, e: end, t: t("pages.guide.noInfo") }]).map((p) => (
                        <button key={p.s} dir="auto" data-nav data-pill data-guide data-cur={current?.id === ch.id && p.s <= Date.now() && p.e > Date.now() ? "" : undefined} onClick={() => onOpen(ch, items)} onFocus={onFocusProg && (() => onFocusProg(ch, vis.length ? p : null))}
                          className={`absolute truncate rounded-xl text-start ${mob ? "px-2 text-sm" : "px-3 text-base"} ${p.s <= Date.now() && p.e > Date.now() ? "bg-accent-blue-container text-foreground" : "bg-surface-2"}`}
                          style={{ top: 6 * k, height: ROW - 12 * k, left: CH_W + px(p.s), width: Math.max(40, px(p.e) - px(p.s) - 4) }}>
                          {p.t}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
