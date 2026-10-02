import { memo, useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { GuideGrid } from "@/components/GuideGrid"
import { Clock, Logo } from "@/components/tv/ui"
import { hm } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import type { Item, Prog } from "@/lib/types"
import { KeyHint } from "./key-hint"

/** Full-screen programme guide over the playing video. [data-modal] keeps the D-pad inside; picking a cell tunes it (Player.tune) and closes. */
export const GuideOverlay = memo(function GuideOverlay({ item, tune, close }: { item: Item; tune: (c: Item, list: Item[]) => void; close: () => void }) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const [hl, setHl] = useState<{ ch: Item; p: Prog | null } | null>(null)
  const onFocusProg = useCallback((ch: Item, p: Prog | null) => setHl({ ch, p }), [])

  // focus enters the watched channel's on-now cell; the grid mounts its rows a frame or two after scrolling to it
  useEffect(() => {
    let n = 0, id = 0
    const go = () => {
      const r = ref.current
      const el = r?.querySelector<HTMLElement>("[data-cur]") ?? (n >= 12 ? r?.querySelector<HTMLElement>("[data-guide]") : null)
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest", inline: "nearest" }) }
      else if (n++ < 40) id = requestAnimationFrame(go)
    }
    id = requestAnimationFrame(go)
    return () => cancelAnimationFrame(id)
  }, [])

  const ch = hl?.ch ?? item
  const p = hl?.p
  return (
    <section ref={ref} data-modal data-guide-overlay role="dialog" aria-label={t("player.guide")} className="pl-guide m-fade absolute inset-0 z-[12] flex flex-col px-[var(--gx)] pl-pad-top pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-3 flex shrink-0 items-center gap-4">
        <div className="size-14 shrink-0 overflow-hidden rounded-[calc(var(--pl-r)*.4)] bg-surface-3"><Logo item={ch} className="size-full p-1" /></div>
        <div className="min-w-0 flex-1">
          <div dir="auto" className="pl-title truncate">{ch.num ? <bdi className="me-2 text-white/60">{fmt.number(ch.num)}</bdi> : null}{ch.name}</div>
          <div className="pl-sub truncate">
            {p ? <><bdi dir="auto">{p.t}</bdi> <bdi dir="ltr" className="text-white/60">{hm(p.s)} - {hm(p.e)}</bdi></> : <span className="text-white/60">{ch.group}</span>}
          </div>
          {p?.d && <div dir="auto" className="line-clamp-1 text-sm text-white/60">{p.d}</div>}
        </div>
        <div className="hidden shrink-0 items-center gap-4 text-white/70 md:flex">
          <KeyHint k={isTv ? "OK" : "Enter"} label={t("player.guide.tune")} />
          <KeyHint k={isTv ? "Back" : "Esc"} label={t("player.guide.closeHint")} />
        </div>
        <div dir="ltr" className="shrink-0 text-2xl tabular-nums text-white/90"><Clock /></div>
        <RoundButton data-close label={t("player.close")} className="pl-btn pl-rb" onClick={close}><X /></RoundButton>
      </header>
      <GuideGrid className="min-h-0 flex-1" current={item} onOpen={tune} onFocusProg={onFocusProg} />
    </section>
  )
})
