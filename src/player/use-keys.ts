import { useEffect } from "react"
import { isTv } from "@/lib/device"
import { dialogOutside, KEY, navState } from "@/lib/nav"
import type { P } from "./use-player"
import { fsEl } from "./util"

const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
const active = () => document.activeElement as HTMLElement | null

/**
 * Remote and keyboard, in the capture phase (before the app's spatial nav). One rule set per screen state:
 *
 *  clean video (nothing focusable on screen: the app's nav is locked)
 *    VOD   OK play/pause (or Skip intro while its chip shows) · Left/Right -10 s / +10 s · Up or Info: controls · Down: panel
 *    live  Up/Down or CH+/CH-: zap · Left/Right: channel list · OK or Info: controls · 0-9: channel number
 *  controls up      the D-pad moves between them (scrubber: Left/Right seek); Down from the tab chips opens the panel there; Back hides them
 *  panel / channels the D-pad moves inside; Up from the panel's tabs closes it; Back closes it
 *  always           Back = one layer back (panel, controls, then leave: playback goes on in the mini player) · Play/Pause/Stop/FF/RW · Red favorite · Green / Blue audio & subtitles · Yellow picture size
 *  desktop          Space/K play · arrows seek / volume (live: zap) · F fullscreen · M mute · P picture in picture · C channels · S subtitles · ? shortcuts · Esc
 */
export function useKeys(p: P & { off: boolean; root: () => HTMLElement | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOutside(".pl-root")) return // a PIN prompt, keyboard, trailer... over the player owns the keys
      const k = e.keyCode
      const take = () => { e.preventDefault(); e.stopPropagation() }
      if (p.off) { // mini player: only the media keys still drive it
        if (k === KEY.play) return take(), p.play()
        if (k === KEY.pause) return take(), p.pause()
        if (k === KEY.stop) return take(), p.stop()
        return
      }

      /* Back: peel one layer */
      if (k === KEY.back || k === KEY.esc || (k === KEY.bksp && isTv && !typing(e))) {
        take()
        if (p.layer !== "none") p.closeLayer()
        else if (!isTv && fsEl()) p.toggleFs()
        else if (p.E.err) p.leave()
        else if (p.nextOn) p.nu.cancel()
        else if (p.chrome && (isTv || k !== KEY.esc)) p.hide()
        else p.leave() // the page closes; playback goes on in the mini player (host.tsx) unless that is off
        return
      }

      /* media + colour keys, any state */
      if (k === KEY.play) return take(), p.play()
      if (k === KEY.pause) return take(), p.pause()
      if (k === KEY.stop) return take(), p.stop()
      if (k === KEY.ff) return take(), p.seek(30)
      if (k === KEY.rw) return take(), p.seek(-10)
      if (k === KEY.red) return take(), p.toggleFav()
      if (k === KEY.green || k === KEY.blue) return take(), p.openPanel("av")
      if (k === KEY.yellow) return take(), p.cycleFit()
      if (k === KEY.info) return take(), p.layer === "none" && (p.chrome ? p.hide() : p.poke())

      /* a layer is open: the D-pad belongs to it */
      if (p.layer !== "none") {
        if (p.layer === "panel" && k === KEY.up && active()?.closest("[data-tabs]")) { take(); p.closeLayer() }
        return
      }

      /* live: zap and channel numbers whenever no layer is open */
      if (p.live && (k === KEY.chUp || k === KEY.chDown)) return take(), p.zap(k === KEY.chUp ? 1 : -1)
      if (p.live && k >= 48 && k <= 57 && !typing(e)) return take(), p.digit(k - 48)

      /* desktop keyboard */
      if (!isTv && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase()
        if (k === 32 || key === "k") { take(); p.toggle(); return p.poke() }
        if (key === "f") return take(), p.toggleFs(p.root())
        if (key === "m") return take(), p.toggleMute()
        if (key === "p" && p.canPip) return take(), p.togglePip()
        if (key === "c" && p.live) return take(), p.openChannels()
        if (key === "s") return take(), p.openPanel("av")
        if (e.key === "?") return take(), p.openPanel("info")
        if (k === KEY.left || k === KEY.right) { take(); if (!p.live) p.seek(k === KEY.left ? -10 : 10); return p.poke() }
        if (k === KEY.up || k === KEY.down) { take(); const d = k === KEY.up ? 1 : -1; if (p.live) p.zap(d); else p.setVolume((p.muted ? 0 : p.vol) + d * 0.1); return p.poke() }
        p.poke()
        return
      }

      /* TV, clean video */
      if (navState.lock) {
        take()
        if (p.live) {
          if (k === KEY.up || k === KEY.down) return p.zap(k === KEY.up ? 1 : -1)
          if (k === KEY.left || k === KEY.right) return p.openChannels()
          return p.poke() // OK / anything else: the controls
        }
        if (k === KEY.left || k === KEY.right) { p.seek(k === KEY.left ? -10 : 10); p.poke(); return focusSeek(p.root()) } // a held key keeps scrubbing on the bar
        if (k === KEY.down) return p.openPanel()
        if (k === KEY.enter) { if (p.seg && p.seg.kind !== "jump") return p.skip(); p.toggle(); return p.poke() }
        return p.poke()
      }

      /* TV, controls up */
      if (!p.nextOn) p.poke() // the Next card keeps its own focus; arrows there do not pull the controls over it
      const a = active()
      if (a?.dataset.seek !== undefined && (k === KEY.left || k === KEY.right)) { take(); return p.seek(k === KEY.left ? -10 : 10) }
      if (a?.dataset.seek !== undefined && k === KEY.enter) { take(); return p.toggle() }
      if (k === KEY.down && a?.dataset.tabchip !== undefined) { take(); return a.dataset.tabchip === "channels" ? p.openChannels() : p.openPanel(a.dataset.tabchip as never) }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })
}

/** Focus the scrubber once the controls are on screen (the next frame). */
function focusSeek(root: HTMLElement | null) {
  requestAnimationFrame(() => root?.querySelector<HTMLElement>("[data-seek]")?.focus())
}
