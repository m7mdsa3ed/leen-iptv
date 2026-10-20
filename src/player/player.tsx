import { useEffect, useRef } from "react"
import { isTv, useTouch } from "@/lib/device"
import { navState, useRoute } from "@/lib/nav"
import type { Item } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { ErrorView, Mini, NextCard, SkipChip } from "./cards"
import { Chrome } from "./chrome"
import { closePlayer } from "./host"
import { Flash, NumberEntry, Spinner } from "./indicators"
import { Channels, LiveBanner } from "./live"
import { Panel } from "./panel"
import { FITS } from "./prefs"
import { Subtitles } from "./subtitles"
import { useKeys } from "./use-keys"
import { usePlayer } from "./use-player"
import "./player.css"

/**
 * The player screen. Everything it does lives in usePlayer (use-player.ts); keys in use-keys.ts. On screen, at most one of:
 * clean video · the chrome (title, scrubber, tab chips) · the panel (Episodes / Audio & subtitles / Playback / Info) · the live
 * channel list · the error. Plus what floats: the live banner, Skip intro, the Next episode card, the flash, the spinner.
 * `mini` = shrunk to the corner while another page is on top (host.tsx): video only, tap to expand. `start` = from the beginning.
 */
export default function Player({ queue, index, start, mini = false }: { queue: Item[]; index: number; start?: boolean; mini?: boolean }) {
  const t = useT()
  const vref = useRef<HTMLVideoElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const touch = useTouch() && !isTv
  const p = usePlayer({ queue, index, start, mini, vref })
  const getRoot = () => root.current
  useKeys({ ...p, off: mini, root: getRoot })

  /* the app's D-pad nav stays out while nothing focusable is on screen (the keys are the player's then) */
  navState.lock = !mini && !p.chrome && p.layer === "none" && !p.E.err && !p.nextOn
  useEffect(() => () => { navState.lock = false }, [])

  /* TV focus: the controls come up on the scrubber (live: the first chip), or back on the chip whose layer just closed; the error on Retry */
  const back = useRef("")
  useEffect(() => { if (p.layer === "panel") back.current = p.tab; else if (p.layer === "channels") back.current = "channels" }, [p.layer]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mini || !isTv || !p.chrome || p.layer !== "none" || p.E.err || p.nextOn) return
    const id = requestAnimationFrame(() => {
      const r = root.current
      const a = document.activeElement as HTMLElement | null
      if (!r || (a && r.contains(a) && a.closest("[data-controls]"))) return // already on a control
      const el = (back.current && r.querySelector<HTMLElement>(`[data-tabchip="${back.current}"]`)) || r.querySelector<HTMLElement>("[data-seek]") || r.querySelector<HTMLElement>("[data-tabchip]")
      back.current = ""
      el?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [p.chrome, p.layer, p.E.err, p.nextOn, mini])
  useEffect(() => { if (p.E.err && !mini) requestAnimationFrame(() => root.current?.querySelector<HTMLElement>("[role=alertdialog] [data-autofocus]")?.focus()) }, [p.E.err, mini])

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
      data-chrome={p.chrome && p.layer === "none" ? "" : undefined}
      className={`dark pl-root ${mini ? "absolute" : "fixed"} inset-0 overflow-hidden bg-black text-white${!mini && !p.chrome && p.layer === "none" && !isTv ? " cursor-none" : ""}`}
      onMouseMove={() => { if (!mini && ptr.current === "mouse") p.poke() }}
      onTouchStart={(e) => { swipe.current = (e.target as HTMLElement).closest("[data-seek],[data-modal]") ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s || mini || p.layer !== "none" || p.E.err) return
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
      {mini ? (
        <Mini name={p.item.name} paused={p.E.paused} buf={p.E.buf} canPip={p.canPip} onExpand={() => useRoute.getState().go("player", { queue: p.queue, index: p.idx })} onToggle={p.toggle} onPip={p.togglePip} onClose={closePlayer} />
      ) : (
        <>
          <Subtitles vref={vref} lift={p.chrome && p.layer === "none"} />
          {p.E.buf && !p.E.err && <Spinner title={p.item.name} started={p.E.started} label={t("player.loading")} />}
          <Flash f={p.flash} />
          {p.num && <NumberEntry n={p.num} />}
          {p.live && <LiveBanner item={p.item} on={(p.chrome || p.banner) && p.layer === "none" && !p.E.err} />}
          <Chrome p={p} vref={vref} tv={isTv} touch={touch} root={getRoot} />
          {p.seg && p.layer === "none" && <SkipChip seg={p.seg} onSkip={p.skip} />}
          {p.nextOn && p.nextItem && p.layer === "none" && <NextCard item={p.nextItem} secs={p.nu.secs} auto={p.autoNext} tv={isTv} onPlay={p.nu.skip} onCancel={p.nu.cancel} />}
          {p.layer === "panel" && <Panel p={p} />}
          {p.layer === "channels" && <Channels item={p.item} onTune={(c, list) => { p.closeLayer(); p.playItem(c, list) }} onClose={p.closeLayer} />}
          {p.E.err && <ErrorView name={p.item.name} msg={p.E.err} canNext={p.queue.length > 1} onRetry={p.E.retry} onNext={() => p.zap(1)} onBack={p.leave} />}
        </>
      )}
    </div>
  )
}
