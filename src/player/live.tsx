import { memo, useEffect, useMemo, useRef, useState } from "react"
import { groupLabel, Logo } from "@/components/tv/ui"
import { FAV } from "@/components/tv/groups"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { usePData } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useProgramme } from "./programme"
import { Row, Sheet, Tag } from "./ui"

const CAP = 200 // channel rows mounted around the playing one (a category can hold thousands)
const IDLE_MS = 12000 // the list closes by itself after this long without input

/** What is playing, live: logo, LIVE + number + category, the channel, then the programme on now (times, progress) and the next one.
 *  The dock's head (chrome.tsx), so it shows after a zap and while the controls are up. */
export function LiveHead({ item }: { item: Item }) {
  const t = useT()
  const { current, next, pct } = useProgramme(item)
  return (
    <div className="pl-head">
      <div className="flex items-center gap-4">
        <span className="pl-logo"><Logo item={item} className="size-full p-1.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="pl-meta">
            <Tag tone="live">{t("player.live")}</Tag>
            {item.num ? <bdi className="pl-num">{fmt.number(item.num)}</bdi> : null}
            {item.group && <span dir="auto" className="pl-trunc">{groupLabel(item.group, t)}</span>}
          </div>
          <div dir="auto" className="pl-title pl-trunc mt-1">{item.name}</div>
        </div>
      </div>
      {current && (
        <div className="mt-2">
          <div className="flex items-baseline gap-3">
            <span dir="auto" className="pl-trunc min-w-0 flex-1 text-[length:var(--pl-fs-l)] font-medium">{current.title}</span>
            <span dir="ltr" className="pl-time shrink-0 text-end">{fmt.time(current.start)} - {fmt.time(current.end)}</span>
          </div>
          <span dir="ltr" className="pl-track mt-2"><span className="pl-fill" style={{ transform: `scaleX(${pct / 100})` }} /></span>
          {next && <div dir="auto" className="pl-meta mt-2"><span className="shrink-0 opacity-70">{t("player.more.nextProgramme")}:</span><span className="pl-trunc">{next.title}</span><bdi dir="ltr" className="pl-num shrink-0">{fmt.time(next.start)}</bdi></div>}
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
    <Sheet side="start" label={t("player.channels")} head={<h2 className="pl-title pl-trunc min-w-0 flex-1">{t("player.channels")}</h2>} onClose={onClose}
      sref={ref} onKeyDown={bump} onPointerMove={bump} onWheel={bump}>
      <div className="flex min-h-0 flex-1">
        <div data-nav-group="memory" className="pl-col pl-list no-scrollbar w-[38%] max-w-[15rem] shrink-0">
          {groups.map((x) => (
            <Row key={x} on={x === g} aria-current={x === g ? "true" : undefined} onClick={() => setG(x)} onFocus={() => isTv && setG(x)} label={groupLabel(x, t)} trail={null} />
          ))}
        </div>
        <div key={g} data-nav-group className="pl-col pl-list no-scrollbar min-w-0 flex-1">
          {shown.map((c) => {
            const cur = c.id === item.id
            return (
              <Row key={c.id} data-ch="" data-cur={cur ? "" : undefined} aria-current={cur ? "true" : undefined} on={cur} onClick={() => (cur ? onClose() : onTune(c, list))}
                lead={<><span className="pl-logo" data-size="sm"><Logo item={c} className="size-full p-1" /></span>{c.num ? <bdi className="pl-num w-10 shrink-0 opacity-60">{fmt.number(c.num)}</bdi> : null}</>}
                label={c.name} trail={cur ? <Tag>{t("player.more.playing")}</Tag> : null} />
            )
          })}
          {!shown.length && <p className="pl-note p-4">{t("player.noChannels")}</p>}
        </div>
      </div>
    </Sheet>
  )
})
