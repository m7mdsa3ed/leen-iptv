import { memo, useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { groupLabel, Logo } from "@/components/tv/ui"
import { FAV } from "@/components/tv/groups"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { usePData } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/types"
import { useProgramme } from "./programme"

const CAP = 200 // channel rows mounted around the playing one (a category can hold thousands)
const IDLE_MS = 12000 // the list closes by itself after this long without input

/** Live channel banner (bottom start): logo, number, name, category, and what is on now / next with its progress. After a zap and while the controls are up. */
export function LiveBanner({ item, on }: { item: Item; on: boolean }) {
  const t = useT()
  const { current, next, pct } = useProgramme(item)
  return (
    <div data-on={on ? "" : undefined} className="pl-layer pl-banner pointer-events-none">
      <div className="flex items-center gap-4">
        <span className="pl-logo"><Logo item={item} className="size-full p-1.5" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="pl-live">{t("player.live")}</span>
            {item.num ? <bdi className="pl-sub tabular-nums">{fmt.number(item.num)}</bdi> : null}
            {item.group && <span dir="auto" className="pl-sub truncate">{groupLabel(item.group, t)}</span>}
          </div>
          <div dir="auto" className="pl-title truncate">{item.name}</div>
        </div>
      </div>
      {current && (
        <div className="mt-3 max-w-xl">
          <div className="flex items-baseline gap-3">
            <span dir="auto" className="min-w-0 flex-1 truncate text-lg font-medium">{current.title}</span>
            <span dir="ltr" className="pl-sub shrink-0 tabular-nums">{fmt.time(current.start)} - {fmt.time(current.end)}</span>
          </div>
          <div dir="ltr" className="pl-prog mt-2"><span style={{ width: `${pct}%` }} /></div>
          {next && <div className="pl-sub mt-2 truncate" dir="auto"><span className="opacity-70">{t("player.more.nextProgramme")}: </span>{next.title} <bdi dir="ltr" className="tabular-nums">{fmt.time(next.start)}</bdi></div>}
        </div>
      )}
    </div>
  )
}

/**
 * Live channel list, a side sheet: categories (Favorites first) beside the channels of the picked one. On TV moving onto a category
 * shows its channels; moving through channels never tunes, OK does (then the list closes). The playing channel has focus when it opens.
 * Closes on Back, on a tap outside, or after IDLE_MS without input. [data-modal] keeps the D-pad inside.
 */
export const Channels = memo(function Channels({ item, onTune, onClose }: { item: Item; onTune: (c: Item, list: Item[]) => void; onClose: () => void }) {
  const t = useT()
  const live = useCatalog((s) => s.byKind.live)
  const real = useCatalog((s) => s.groups.live)
  const favs = usePData().favs
  const hasFav = useMemo(() => live.some((c) => favs.includes(c.id)), [live, favs])
  const groups = useMemo(() => (hasFav ? [FAV, ...real] : real), [hasFav, real])
  const [g, setG] = useState(item.group)
  const list = useMemo(() => live.filter((c) => (g === FAV ? favs.includes(c.id) : c.group === g)), [live, g, favs])
  const shown = useMemo(() => {
    const i = Math.max(0, list.findIndex((c) => c.id === item.id))
    const a = Math.max(0, Math.min(i - CAP / 2, list.length - CAP))
    return list.slice(a, a + CAP)
  }, [list, item.id])
  const ref = useRef<HTMLElement>(null)
  const idle = useRef(0)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const bump = () => { clearTimeout(idle.current); idle.current = window.setTimeout(() => closeRef.current(), IDLE_MS) }
  useEffect(() => { bump(); return () => clearTimeout(idle.current) }, [])
  // focus the playing channel (or the first one) of the shown category
  const first = useRef(true)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const r = ref.current
      const el = r?.querySelector<HTMLElement>("[data-ch][data-cur]") ?? (first.current ? r?.querySelector<HTMLElement>("[data-ch]") : null)
      first.current = false
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: "center" })
    })
    return () => cancelAnimationFrame(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div aria-hidden className="absolute inset-0 z-[11] bg-black/40 m-fade" onClick={onClose} />
      <section ref={ref} data-modal role="dialog" aria-label={t("player.channels")} className="pl-side m-fade absolute inset-y-0 start-0 z-[12] flex flex-col"
        onKeyDown={bump} onPointerMove={bump} onWheel={bump}>
        <header className="flex items-center gap-3 px-5 pb-3 pt-[max(1.25rem,var(--safe-t))]">
          <h2 className="pl-title flex-1">{t("player.channels")}</h2>
          {!isTv && <RoundButton label={t("player.close")} onClick={onClose} className="pl-rb"><X /></RoundButton>}
        </header>
        <div className="flex min-h-0 flex-1">
          <div data-nav-group="memory" className="pl-col no-scrollbar w-[38%] max-w-[15rem] shrink-0 overflow-y-auto p-2">
            {groups.map((x) => (
              <button key={x} data-nav aria-current={x === g ? "true" : undefined} onClick={() => setG(x)} onFocus={() => isTv && setG(x)}
                className={cn("pl-row-btn w-full text-start", x === g && "pl-row-on")}>
                <bdi dir="auto" className="truncate">{groupLabel(x, t)}</bdi>
              </button>
            ))}
          </div>
          <div key={g} data-nav-group className="no-scrollbar min-w-0 flex-1 overflow-y-auto p-2">
            {shown.map((c) => {
              const cur = c.id === item.id
              return (
                <button key={c.id} data-nav data-ch data-cur={cur ? "" : undefined} aria-current={cur ? "true" : undefined} onClick={() => (cur ? onClose() : onTune(c, list))}
                  className={cn("pl-row-btn flex w-full items-center gap-3 text-start", cur && "pl-row-on")}>
                  <span className="pl-logo pl-logo-sm"><Logo item={c} className="size-full p-1" /></span>
                  {c.num ? <bdi className="w-10 shrink-0 tabular-nums opacity-60">{fmt.number(c.num)}</bdi> : null}
                  <span dir="auto" className="min-w-0 flex-1 truncate">{c.name}</span>
                  {cur && <span className="pl-live shrink-0">{t("player.more.playing")}</span>}
                </button>
              )
            })}
            {!shown.length && <p className="p-4 text-white/60">{t("player.noChannels")}</p>}
          </div>
        </div>
      </section>
    </>
  )
})
