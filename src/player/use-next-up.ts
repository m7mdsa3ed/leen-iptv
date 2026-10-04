import { useEffect, useRef, useState, type RefObject } from "react"
import { NEXT_LEAD, NEXT_SECS } from "./util"

/** "Next episode" card state: appears NEXT_LEAD seconds before the end and (when `auto`) counts down NEXT_SECS, then calls onNext; with auto off it just waits for Play now.
    Cancel hides it for now; seeking back out of the last NEXT_LEAD seconds re-arms it, so it comes again at the same point. `blocked` = Cancel pressed (the episode end must not auto-advance). */
export function useNextUp(o: { vref: RefObject<HTMLVideoElement | null>; enabled: boolean; itemId: string; onNext: () => void; auto: boolean }) {
  const { vref, enabled, itemId, auto } = o
  const [show, setShow] = useState(false)
  const [secs, setSecs] = useState(NEXT_SECS)
  const dismissed = useRef(false) // cancelled / already used: stays hidden until the playhead leaves the last NEXT_LEAD seconds
  const blocked = useRef(false) // cancelled
  const onNext = useRef(o.onNext)
  onNext.current = o.onNext

  useEffect(() => { dismissed.current = false; blocked.current = false; setShow(false); setSecs(NEXT_SECS) }, [itemId])

  useEffect(() => {
    const v = vref.current
    if (!v || !enabled) return setShow(false)
    const f = () => {
      const d = v.duration, c = v.currentTime
      if (!(d > 0) || !isFinite(d)) return
      if (d - c > NEXT_LEAD) { dismissed.current = false; blocked.current = false } // out of the window: re-arm
      setShow(!dismissed.current && d - c <= NEXT_LEAD && d - c >= 0)
    }
    v.addEventListener("timeupdate", f)
    return () => v.removeEventListener("timeupdate", f)
  }, [vref, enabled, itemId])

  useEffect(() => {
    if (!show || !auto) return setSecs(NEXT_SECS)
    const t = setInterval(() => setSecs((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [show, auto])
  useEffect(() => { if (show && auto && secs <= 0) { dismissed.current = true; setShow(false); onNext.current() } }, [show, secs])

  return {
    show, secs, blocked,
    cancel: () => { dismissed.current = true; blocked.current = true; setShow(false) },
    skip: () => { dismissed.current = true; setShow(false); onNext.current() },
  }
}
