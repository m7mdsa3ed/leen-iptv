import { useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import { LeenMark } from "@/components/gtv"
import { Clock } from "@/components/tv/ui"
import { useTrailer } from "@/components/TrailerModal"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { catsOf, findLock } from "@/lib/merge-pure"
import { useRoute } from "@/lib/nav"
import { useApp, useProfile } from "@/lib/store"
import { usePlayerHost } from "@/player/host"

const SLIDE_MS = 12000
const CHECK_MS = 10000
/** Minutes of no input before the saver starts; 0 = off. TVs default to 5 (OLED burn-in), other devices to off. */
export const saverMinutes = (v: number | undefined) => v ?? (isTv ? 5 : 0)

const useSaver = create<{ on: boolean }>(() => ({ on: false }))
/** Shows the screen saver now (Settings preview); any input ends it. */
export const startSaver = () => useSaver.setState({ on: true })
/** True while the saver covers the screen: the player yields its keys to it (the input that wakes it must do nothing else). */
export const saverOn = () => useSaver.getState().on

// never over moving video: the player playing, Multiview or a trailer, nor while the page is hidden. A paused player is fair game
// (its frame sits still), and any input ends the saver as usual.
const blocked = () => {
  const p = usePlayerHost.getState()
  return (!!p.s && !p.paused) || !!useTrailer.getState().cur || document.hidden || useRoute.getState().stack[useRoute.getState().stack.length - 1]?.name === "multi"
}

/**
 * Idle watcher + full-screen slideshow of movie/series backdrops with a clock. Mounted once in App.
 * While it is up, the input that ends it is swallowed (capture phase), so the wake-up key never moves focus, goes Back or presses a button.
 */
export function ScreenSaver() {
  const on = useSaver((s) => s.on)
  const mins = useApp((s) => saverMinutes(s.settings.screensaver))

  useEffect(() => {
    let last = Date.now(), shownAt = 0
    const wake = (e: Event) => {
      last = Date.now()
      if (!useSaver.getState().on) return
      // the overlay appearing under a still mouse fires a move: only a real move wakes, and not in the first second
      if (e.type === "pointermove" && (Date.now() - shownAt < 1000 || !((e as PointerEvent).movementX || (e as PointerEvent).movementY))) return
      e.preventDefault()
      e.stopImmediatePropagation()
      useSaver.setState({ on: false })
    }
    const evs = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const
    for (const k of evs) window.addEventListener(k, wake, { capture: true, passive: k !== "keydown" && k !== "pointerdown" })
    const unsub = useSaver.subscribe((s) => { if (s.on) shownAt = Date.now(); else last = Date.now() })
    const onVis = () => { if (!document.hidden) last = Date.now() }
    document.addEventListener("visibilitychange", onVis)
    const iv = mins > 0 ? window.setInterval(() => {
      if (useSaver.getState().on) { if (blocked()) useSaver.setState({ on: false }); return } // playback started behind it (remote, notification)
      if (blocked()) last = Date.now()
      else if (Date.now() - last >= mins * 60000) useSaver.setState({ on: true })
    }, CHECK_MS) : 0
    return () => {
      for (const k of evs) window.removeEventListener(k, wake, { capture: true })
      unsub()
      document.removeEventListener("visibilitychange", onVis)
      clearInterval(iv)
    }
  }, [mins])

  return on ? <Slides /> : null
}

function Slides() {
  const t = useT()
  const movies = useCatalog((s) => s.byKind.movie)
  const series = useCatalog((s) => s.byKind.series)
  const p = useProfile()
  const clockOnly = useApp((s) => s.settings.saverStyle === "clock")
  // up to 40 random titles with a backdrop, none from a PIN-locked category; none at all for the clock-only style
  const pool = useMemo(() => {
    if (clockOnly) return []
    const ok = [...(movies ?? []), ...(series ?? [])].filter((i) => i.backdrop && !(p?.pin && catsOf(i).some((c) => findLock(p.locked, i.kind, c))))
    for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ok[i], ok[j]] = [ok[j], ok[i]] }
    return ok.slice(0, 40)
  }, [movies, series, p, clockOnly])
  const [n, setN] = useState(0)
  useEffect(() => {
    const iv = window.setInterval(() => setN((x) => x + 1), SLIDE_MS)
    return () => clearInterval(iv)
  }, [])
  const cur = pool.length ? pool[n % pool.length] : undefined
  const prev = pool.length > 1 && n > 0 ? pool[(n - 1) % pool.length] : undefined
  useEffect(() => { if (pool.length > 1) new Image().src = pool[(n + 1) % pool.length].backdrop! }, [n, pool]) // preload the next slide
  const corner = n % 4 // the info block walks the corners so nothing stays lit in one place
  const pos = ["bottom-[6vh] start-[5vw]", "bottom-[6vh] end-[5vw] items-end text-end", "top-[6vh] end-[5vw] items-end text-end", "top-[6vh] start-[5vw]"][corner]

  return (
    <div className="dark fixed inset-0 z-[80] cursor-none overflow-hidden bg-black text-white" aria-hidden>
      {prev && <img key={`p${n}`} src={prev.backdrop} alt="" className="absolute inset-0 size-full object-cover" />}
      {cur && <img key={`c${n}`} src={cur.backdrop} alt="" decoding="async" className="bg-drift absolute inset-0 size-full object-cover" />}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,.75))]" />
      <div key={corner} className={`m-rise absolute flex flex-col gap-1 drop-shadow-[0_2px_8px_rgba(0,0,0,.8)] ${pos}`}>
        {!cur && !clockOnly && <LeenMark className="mb-4 size-16" />}
        <div className="text-6xl font-light tabular-nums"><Clock /></div>
        <div className="text-xl text-white/80">{fmt.date(new Date(), { weekday: "long", day: "numeric", month: "long" })}</div>
        {cur && <div className="mt-4 max-w-[40vw] truncate text-lg text-white/70" dir="auto">{cur.name}{cur.year ? ` (${cur.year})` : ""}</div>}
        <div className="mt-1 text-sm text-white/50">{t("common.saver.wake")}</div>
      </div>
    </div>
  )
}
