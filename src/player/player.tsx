import { useEffect, useRef } from "react"
import { isTv, useTouch } from "@/lib/device"
import { navState } from "@/lib/nav"
import type { Item } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { ErrorView, NextCard } from "./cards"
import { Chrome, VideoClock } from "./chrome"
import { Flash, NumberEntry, Spinner } from "./indicators"
import { Channels } from "./live"
import { Panel } from "./panel"
import { FITS } from "./prefs"
import { Subtitles } from "./subtitles"
import { useKeys } from "./use-keys"
import { usePlayer } from "./use-player"
import "./player.css"

/**
 * The player screen. Everything it does lives in usePlayer (use-player.ts); keys in use-keys.ts; the look in player.css + ui.tsx.
 * On screen, at most one of: clean video · the chrome (top bar + the dock: what is playing, scrubber, control row; chrome.tsx) ·
 * the panel (Episodes / Audio & subtitles / Playback / Info) · the live channel list · the error. Plus what floats: the dock's
 * head alone after a change of item, the Next episode card (above the dock), the flash, the spinner.
 * `start` = from the beginning.
 */
export default function Player({ queue, index, start }: { queue: Item[]; index: number; start?: boolean }) {
  const t = useT()
  const vref = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const touch = useTouch() && !isTv
  const p = usePlayer({ queue, index, start, vref })
  const getRoot = () => root.current
  // the dock: what is playing (paused: the title's metadata, paused.tsx), + the controls while they are up
  const dock = p.stopped || (p.layer === "none" && !p.E.err && (p.chrome || p.banner))
  useKeys({ ...p, root: getRoot })

  /* the app's D-pad nav stays out while nothing focusable is on screen (the keys are the player's then) */
  navState.lock = !p.chrome && p.layer === "none" && !p.E.err && !p.nextOn
  useEffect(() => () => { navState.lock = false }, [])

  /* TV focus: the controls come up on the scrubber (live: the first chip), or back on the chip whose layer just closed; the error on Retry */
  const back = useRef("")
  useEffect(() => { if (p.layer === "panel") back.current = p.tab; else if (p.layer === "channels") back.current = "channels" }, [p.layer]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isTv || !p.chrome || p.layer !== "none" || p.E.err || p.nextOn) return
    const id = requestAnimationFrame(() => {
      const r = root.current
      const a = document.activeElement as HTMLElement | null
      if (!r || (a && r.contains(a) && a.closest("[data-controls]"))) return // already on a control
      const el = (back.current && r.querySelector<HTMLElement>(`[data-tabchip="${back.current}"]`)) || r.querySelector<HTMLElement>("[data-seek]") || r.querySelector<HTMLElement>("[data-tabchip]")
      back.current = ""
      el?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [p.chrome, p.layer, p.E.err, p.nextOn])
  useEffect(() => { if (p.E.err) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[role=alertdialog] [data-autofocus]")?.focus()) }, [p.E.err])

  /* pointer: mouse click = play / pause, double click = fullscreen; touch tap = controls, double tap on a side = -10 / +10 s, swipe up = panel */
  const ptr = useRef("mouse")
  const tap = useRef({ at: 0, timer: 0 })
  const swipe = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => () => clearTimeout(tap.current.timer), [])
  const onVideoClick = (e: React.MouseEvent) => {
    if (isTv) return
    if (ptr.current === "mouse") { p.toggle(); return p.poke() }
    const tp = tap.current, now = Date.now(), x = e.clientX / window.innerWidth
    clearTimeout(tp.timer)
    if (!p.live && now - tp.at < 300 && (x < 1 / 3 || x > 2 / 3)) { tp.at = 0; p.seek(x < 0.5 ? -10 : 10); return p.poke() }
    tp.at = now
    tp.timer = window.setTimeout(() => (p.chrome ? p.hide() : p.poke()), p.live ? 0 : 300)
  }

  return (
    <div
      ref={root}
      data-dock={dock ? "" : undefined}
      className={`dark pl-root fixed inset-0 overflow-hidden bg-black text-white${!p.chrome && p.layer === "none" && !isTv ? " cursor-none" : ""}`}
      onMouseMove={() => { if (ptr.current === "mouse") p.poke() }}
      onTouchStart={(e) => { swipe.current = (e.target as HTMLElement).closest("[data-seek],[data-modal]") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s || p.layer !== "none" || p.E.err) return
        const dy = e.changedTouches[0].clientY - s.y, dx = e.changedTouches[0].clientX - s.x
        if (dy < -70 && Math.abs(dx) < Math.abs(dy) * 0.6) p.openPanel()
      }}
    >
      <video
        ref={vref}
        playsInline
        className="size-full"
        style={{ objectFit: FITS[p.fit] }}
        onPointerDown={(e) => (ptr.current = e.pointerType)}
        onClick={onVideoClick}
        onDoubleClick={() => !isTv && ptr.current === "mouse" && p.toggleFs(root.current)}
        {...p.video}
      />
      <Subtitles vref={vref} lift={dock && !p.stopped} /> // paused: the panel covers them
      {p.E.buf && !p.E.err && <Spinner title={p.item.name} started={p.E.started} label={t("player.loading")} />}
      <Flash f={p.flash} />
      {p.num && <NumberEntry n={p.num} />}
      {p.clock && p.layer === "none" && !p.E.err && <VideoClock />}
      <Chrome p={p} vref={vref} tv={isTv} touch={touch} dock={dock} root={getRoot} />
      {p.layer === "none" && p.nextOn && p.nextItem && (
        <div className="pl-float">
          <NextCard item={p.nextItem} secs={p.nu.secs} auto={p.autoNext} tv={isTv} onPlay={p.nu.skip} onCancel={p.nu.cancel} />
        </div>
      )}
      {p.layer === "panel" && <Panel p={p} />}
      {p.layer === "channels" && <Channels item={p.item} onTune={(c, list) => { p.closeLayer(); p.playItem(c, list) }} onClose={p.closeLayer} />}
      {p.E.err && <ErrorView name={p.item.name} msg={p.E.err} canNext={p.queue.length > 1} onRetry={p.E.retry} onNext={() => p.zap(1)} onBack={p.leave} />}
    </div>
  )
}
