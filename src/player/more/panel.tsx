import { memo, useEffect, useRef } from "react"
import { ChevronDown } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { describe, isEpisode } from "../util"
import type { MoreActions } from "./actions"
import { EpisodeMore } from "./episode"
import { LiveMore } from "./live"
import { MovieMore } from "./movie"
import { ConnChip } from "./parts"

/** The "More" page: slides up over the (still playing, full-size) video, which peeks above it; the whole layer scrolls on a fading dark gradient (no card, no handle). Lazily mounted by Player; content loads only now.
    [data-modal] keeps the D-pad inside. Memoised with stable props so the 2s stats poll never re-renders it. */
export const MorePanel = memo(function MorePanel({ item, closing, act }: { item: Item; closing: boolean; act: MoreActions }) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const sc = useRef<HTMLDivElement>(null)
  const ts = useRef<{ y: number; top: number } | null>(null)
  const lastScroll = useRef(0)
  const { title, sub } = describe(item, t)

  // focus enters the first real item (the panel's own Close button is the last resort)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const r = ref.current
      const el = r?.querySelector<HTMLElement>("[data-autofocus]") ?? r?.querySelector<HTMLElement>(".pl-cur") ?? r?.querySelector<HTMLElement>("[data-nav]:not([data-close])") ?? r?.querySelector<HTMLElement>("[data-nav]")
      el?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [])
  // exit animation can be skipped (motion off): never leave the panel mounted
  useEffect(() => {
    if (!closing) return
    const id = window.setTimeout(act.closed, 450)
    return () => clearTimeout(id)
  }, [closing, act])

  return (
    <>
      <div aria-hidden className={`pl-dim absolute inset-0 z-[9] bg-black/55 ${closing ? "pl-dim-out" : "pl-dim-in"}`} onClick={act.close} />
      <section
        ref={ref}
        data-modal data-more-panel role="dialog" aria-label={title}
        className={`pl-more ${closing ? "pl-more-out" : "pl-more-in"} absolute inset-0 z-10 text-foreground`}
        onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) act.closed() }}
        onTouchStart={(e) => { ts.current = { y: e.touches[0].clientY, top: sc.current?.scrollTop ?? 0 } }}
        onTouchEnd={(e) => {
          const s = ts.current
          ts.current = null
          if (s && s.top <= 0 && (sc.current?.scrollTop ?? 0) <= 0 && e.changedTouches[0].clientY - s.y > 90) act.close() // swipe down from the top
        }}
        onWheel={(e) => { if (e.deltaY < -30 && (sc.current?.scrollTop ?? 0) <= 0 && Date.now() - lastScroll.current > 350) act.close() }}
      >
        <div ref={sc} data-more-scroll className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain" onScroll={() => (lastScroll.current = Date.now())}>
          <div aria-hidden className="h-[24%] min-h-24" onClick={act.close} />
          <div className="pl-more-body min-h-[76%] px-[var(--gx)] pb-[max(2rem,var(--safe-b))] pt-10">
            <header className="mb-2 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div dir="auto" className="pl-title truncate">{title}</div>
                {sub && <div dir="auto" className="pl-sub truncate">{sub}</div>}
              </div>
              <RoundButton data-close label={t("player.close")} className="pl-btn pl-rb" onClick={act.close}><ChevronDown /></RoundButton>
            </header>
            <ConnChip item={item} />
            {item.kind === "live" ? <LiveMore key={item.id} item={item} act={act} /> : isEpisode(item.id) ? <EpisodeMore key={item.id} item={item} act={act} /> : <MovieMore key={item.id} item={item} act={act} />}
          </div>
        </div>
      </section>
    </>
  )
})
