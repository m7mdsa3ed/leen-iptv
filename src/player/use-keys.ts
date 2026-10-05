import { useEffect } from "react"
import { isTv } from "@/lib/device"
import { dialogOutside, KEY, navState } from "@/lib/nav"
import type { MenuKind } from "./menus"
import { fsEl } from "./util"

export type KeyCtx = {
  live: boolean; show: boolean; menu: MenuKind | null; err: string; help: boolean; more: "closed" | "open" | "closing"; nextShow: boolean; canPip: boolean; overlay: "none" | "strip"
  off?: boolean // mini player: the page owns the keys
  back: () => void; stop: () => void; hide: () => void; closeMenu: () => void; closeHelp: () => void; toggleHelp: () => void
  closeMore: () => void; openMore: () => void; cancelNext: () => void; skipSeg?: () => void
  closeOverlay: () => void; openStrip: () => void
  play: () => void; pause: () => void; toggle: () => void; seek: (d: number) => void; zap: (d: number) => void
  toggleFav: () => void; openMenu: (m: MenuKind) => void; cycleFit: () => void; poke: () => void
  toggleFs: () => void; togglePip: () => void; toggleMute: () => void; setVolume: (delta: number) => void; digit: (d: number) => void
}

/** Focus is on the lowest control row (the More button): nothing focusable below it inside the controls. */
function inBottomRow() {
  const a = document.activeElement as HTMLElement | null
  const box = a?.closest("[data-controls]")
  if (!a || !box) return false
  const r = a.getBoundingClientRect()
  return !Array.from(box.querySelectorAll<HTMLElement>("[data-nav]")).some((el) => el !== a && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().top >= r.bottom - 2)
}

/** Focus is in the panel's first row (its header) and the panel is scrolled to the top: Up closes it. */
function panelAtTop() {
  const p = document.querySelector<HTMLElement>("[data-more-panel]")
  const a = document.activeElement as HTMLElement | null
  if (!p || !a || !p.contains(a)) return false
  const sc = p.querySelector<HTMLElement>("[data-more-scroll]")
  const first = p.querySelector<HTMLElement>("[data-nav]")
  return (sc?.scrollTop ?? 0) <= 8 && !!first && a.getBoundingClientRect().top <= first.getBoundingClientRect().top + 8
}

/** Remote / keyboard handling in the capture phase (before the app's spatial nav). Re-registered every render so it always sees fresh state. */
export function useKeys(c: KeyCtx) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOutside(".pl-root")) return // a PIN prompt, card menu, trailer, keyboard... over the player owns the keys (App's Back handler closes it)
      const k = e.keyCode
      const stop = () => (e.preventDefault(), e.stopPropagation())
      if (c.off) { // mini player: the page owns the keys, only the media keys still drive the video (Stop ends it for good)
        if (k === KEY.play) return stop(), c.play()
        if (k === KEY.pause) return stop(), c.pause()
        if (k === KEY.stop) return stop(), c.stop()
        return
      }
      const locked = navState.lock
      if (k === KEY.back || k === KEY.esc || (k === KEY.bksp && isTv)) {
        stop()
        if (c.overlay !== "none") c.closeOverlay() // topmost layer first (one overlay at a time)
        else if (!isTv && fsEl()) c.toggleFs()
        else if (c.help) c.closeHelp()
        else if (c.menu) c.closeMenu()
        else if (c.more !== "closed") c.closeMore()
        else if (c.err) c.back()
        else if (c.nextShow) c.cancelNext()
        else if (c.show && (isTv || k !== KEY.esc)) c.hide()
        else c.back()
        return
      }
      if (k === KEY.play) return stop(), c.play()
      if (k === KEY.pause) return stop(), c.pause()
      if (k === KEY.stop) return stop(), c.stop()
      if (k === KEY.ff) return stop(), c.seek(30), c.poke()
      if (k === KEY.rw) return stop(), c.seek(-10), c.poke()
      if (c.overlay !== "none") {
        // the strip owns the keys: arrows, OK, CH+/CH- go to the D-pad nav (or the strip's own handler), never to zapping. Only the desktop switch leaks in.
        if (!isTv && c.live && !(e.target instanceof HTMLInputElement)) {
          if (k === 67 && !e.ctrlKey && !e.metaKey && !e.altKey) return stop(), c.openStrip()
        }
        return
      }
      if ((c.menu || c.help) && (k === KEY.chUp || k === KEY.chDown || k === KEY.red || k === KEY.green || k === KEY.yellow || (k >= 48 && k <= 57))) return // a sheet is open: no zapping or toggling behind it
      if (k === KEY.chUp || (locked && c.live && k === KEY.up)) return stop(), c.zap(1)
      if (k === KEY.chDown || (locked && c.live && k === KEY.down)) return stop(), c.zap(-1)
      if (k === KEY.red) return stop(), c.toggleFav()
      if (k === KEY.green) return stop(), c.openMenu("audio")
      if (k === KEY.yellow) return stop(), c.cycleFit(), c.poke()
      if (k === KEY.blue) return stop(), isTv && c.live && locked ? c.poke() : c.openMenu("subs") // live TV, controls hidden: Blue = Info (show the controls)
      if (k === KEY.info) return stop(), c.poke()
      if (k >= 48 && k <= 57 && c.live) return stop(), c.digit(k - 48)
      if (c.more !== "closed") {
        // the panel is a [data-modal]: arrows are spatial nav; Up from its first row closes it
        if (k === KEY.up && panelAtTop()) { stop(); c.closeMore() }
        return
      }
      // Down on the bottom row of the open controls pulls the More panel up (with the controls hidden Down only shows them: see `locked` below)
      if (k === KEY.down && c.show && !c.menu && inBottomRow()) return stop(), c.openMore()
      if (!isTv && !c.menu && !(e.target instanceof HTMLInputElement)) {
        const up = k === KEY.up ? 1 : k === KEY.down ? -1 : 0
        if (k === 32) return stop(), c.toggle(), c.poke()
        if (k === 70) return stop(), c.toggleFs()
        if (c.live && k === 67 && !e.ctrlKey && !e.metaKey && !e.altKey) return stop(), c.openStrip()
        if (k === 80 && c.canPip) return stop(), c.togglePip()
        if (k === 77) return stop(), c.toggleMute()
        if (e.key === "?") return stop(), c.toggleHelp()
        if (!c.live && (k === KEY.left || k === KEY.right)) return stop(), c.seek(k === KEY.left ? -10 : 10), c.poke()
        if (up) return stop(), c.live ? c.zap(up) : c.setVolume(up * 0.1), c.poke()
      }
      if (locked) {
        stop()
        if (isTv && c.live && (k === KEY.left || k === KEY.right)) return c.openStrip() // TV live: Left/Right = channel strip, Info/Blue/other = controls
        if (!c.live && k === KEY.left) c.seek(-10)
        else if (!c.live && k === KEY.right) c.seek(30)
        else if (k === KEY.enter && !c.live) (c.skipSeg ?? c.toggle)()
        c.poke()
        return
      }
      if (!c.nextShow) c.poke() // the Next card is up: arrows move inside it, they do not pull the controls over it
      // while controls are up, the seek bar eats left/right
      if ((document.activeElement as HTMLElement)?.dataset.seek !== undefined && (k === KEY.left || k === KEY.right)) { stop(); c.seek(k === KEY.left ? -10 : 30) }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })
}
