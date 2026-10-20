import { useState, type RefObject } from "react"
import { useT } from "@/lib/i18n"
import { useVideoTime } from "./use-time"
import { mmss } from "./util"

/**
 * The one big scrubber: elapsed time, the bar, time left. Focusable on TV (data-seek: Left/Right seek, OK play/pause, see use-keys);
 * pointer: drag anywhere on it, with the time under the finger shown above. Owns the timeupdate subscription, so nothing else
 * re-renders four times a second.
 */
export function Scrubber({ vref, on, onSeek, onToggle, scrubbing }: { vref: RefObject<HTMLVideoElement | null>; on: boolean; onSeek: (f: number) => void; onToggle: () => void; scrubbing: { current: boolean } }) {
  const t = useT()
  const { cur, dur } = useVideoTime(vref, on)
  const [drag, setDrag] = useState<number | null>(null) // 0..1 under the pointer while dragging
  const p = drag ?? (dur ? Math.min(1, cur / dur) : 0)
  const at = (e: React.PointerEvent<HTMLElement>) => { const b = e.currentTarget.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) }
  const end = (e: React.PointerEvent<HTMLElement>) => { if (drag === null) return; onSeek(at(e)); setDrag(null); scrubbing.current = false }
  return (
    <div dir="ltr" data-ltr className="pl-scrub pointer-events-auto flex items-center gap-4">
      <span className="pl-time text-end">{mmss(drag !== null ? drag * dur : cur)}</span>
      <button
        data-nav data-seek aria-label={t("player.seek")} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(cur)} role="slider"
        className="pl-bar relative flex flex-1 touch-none items-center"
        onClick={(e) => e.detail === 0 && onToggle()} // OK on the bar (keyboard click): play / pause
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrubbing.current = true; setDrag(at(e)) }}
        onPointerMove={(e) => { if (drag !== null) setDrag(at(e)) }}
        onPointerUp={end} onPointerCancel={end}
      >
        <span className="pl-track relative block w-full">
          <span className="pl-fill absolute inset-0 origin-left" style={{ transform: `scaleX(${p})` }} />
          <span className="pl-thumb absolute top-1/2" style={{ left: `${p * 100}%` }} />
          {drag !== null && <span className="pl-bubble absolute bottom-full mb-3 -translate-x-1/2" style={{ left: `${p * 100}%` }}>{mmss(drag * dur)}</span>}
        </span>
      </button>
      <span className="pl-time">{dur ? `-${mmss(Math.max(0, dur - (drag !== null ? drag * dur : cur)))}` : ""}</span>
    </div>
  )
}
