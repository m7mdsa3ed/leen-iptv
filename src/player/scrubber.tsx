import { useState, type RefObject } from "react"
import { useT } from "@/lib/i18n"
import { useVideoTime } from "./use-time"
import { mmss } from "./util"

/**
 * The one big scrubber: elapsed time, the bar, time left. Focusable on TV (data-seek: Left/Right seek, OK play/pause, see use-keys);
 * pointer: drag anywhere on it, with the time under the finger shown above; a mouse previews the time it hovers. The buffered range is drawn behind the fill. Owns the timeupdate subscription, so nothing else
 * re-renders four times a second.
 */
export function Scrubber({ vref, on, onSeek, onToggle, scrubbing }: { vref: RefObject<HTMLVideoElement | null>; on: boolean; onSeek: (f: number) => void; onToggle: () => void; scrubbing: { current: boolean } }) {
  const t = useT()
  const { cur, dur } = useVideoTime(vref, on)
  const [drag, setDrag] = useState<number | null>(null) // 0..1 under the pointer while dragging
  const [hover, setHover] = useState<number | null>(null) // 0..1 under a mouse that is not dragging: the time there is previewed
  const p = drag ?? (dur ? Math.min(1, cur / dur) : 0)
  const v = vref.current
  let buf = 0 // how far the buffer reaches past the playhead (the range that holds it), 0..1
  if (v && dur) for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= cur + 1 && v.buffered.end(i) >= cur) buf = Math.min(1, v.buffered.end(i) / dur)
  const tip = drag ?? hover
  const at = (e: React.PointerEvent<HTMLElement>) => { const b = e.currentTarget.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) }
  const end = (e: React.PointerEvent<HTMLElement>) => { if (drag === null) return; onSeek(at(e)); setDrag(null); scrubbing.current = false }
  return (
    <div dir="ltr" data-ltr className="pl-scrub">
      <span className="pl-time text-end">{mmss(drag !== null ? drag * dur : cur)}</span>
      <button
        data-nav data-seek aria-label={t("player.seek")} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(cur)} role="slider"
        className="pl-bar"
        onClick={(e) => e.detail === 0 && onToggle()} // OK on the bar (keyboard click): play / pause
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubbing.current = true; setDrag(at(e)) }}
        onPointerMove={(e) => { if (drag !== null) setDrag(at(e)); else if (e.pointerType === "mouse") setHover(at(e)) }}
        onPointerLeave={() => setHover(null)}
        onPointerUp={end} onPointerCancel={end}
      >
        <span className="pl-track">
          {buf > p && <span className="pl-fill pl-buf" style={{ transform: `scaleX(${buf})` }} />}
          {hover !== null && drag === null && <span className="pl-fill pl-hover" style={{ transform: `scaleX(${hover})` }} />}
          <span className="pl-fill" style={{ transform: `scaleX(${p})` }} />
          <span className="pl-knob" style={{ left: `${p * 100}%` }} />
          {tip !== null && dur > 0 && <span className="pl-bubble" style={{ left: `${tip * 100}%` }}>{mmss(tip * dur)}</span>}
        </span>
      </button>
      <span className="pl-time">{dur ? `-${mmss(Math.max(0, dur - (drag !== null ? drag * dur : cur)))}` : ""}</span>
    </div>
  )
}
