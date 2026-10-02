import { useEffect, useRef, useState, type RefObject } from "react"
import { NEXT_LEAD, NEXT_SECS } from "./util"

/** "Next episode" card state: appears NEXT_LEAD seconds before the end, counts down NEXT_SECS, then calls onNext.
    Never shows for an item the user seeked back in, or after Cancel. `blocked` = Cancel pressed (the episode end must not auto-advance). */
export function useNextUp(o: { vref: RefObject<HTMLVideoElement | null>; enabled: boolean; itemId: string; onNext: () => void }) {
  const { vref, enabled, itemId } = o
  const [show, setShow] = useState(false)
  const [secs, setSecs] = useState(NEXT_SECS)
  const dismissed = useRef(false) // seeked back or cancelled: do not show again for this item
  const blocked = useRef(false) // cancelled
  const last = useRef(0)
  const onNext = useRef(o.onNext)
  onNext.current = o.onNext

  useEffect(() => { dismissed.current = false; blocked.current = false; last.current = 0; setShow(false); setSecs(NEXT_SECS) }, [itemId])

  useEffect(() => {
    const v = vref.current
    if (!v || !enabled) return setShow(false)
    const f = () => {
      const d = v.duration, c = v.currentTime
      if (!(d > 0) || !isFinite(d)) return
      if (c < last.current - 2) dismissed.current = true // user seeked back
      last.current = c
      setShow(!dismissed.current && d - c <= NEXT_LEAD && d - c > 0)
    }
    const reset = () => { last.current = 0 } // new stream attached (quality switch): not a seek back
    v.addEventListener("timeupdate", f); v.addEventListener("emptied", reset)
    return () => { v.removeEventListener("timeupdate", f); v.removeEventListener("emptied", reset) }
  }, [vref, enabled, itemId])

  useEffect(() => {
    if (!show) return setSecs(NEXT_SECS)
    const t = setInterval(() => setSecs((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [show])
  useEffect(() => { if (show && secs <= 0) { dismissed.current = true; setShow(false); onNext.current() } }, [show, secs])

  return {
    show, secs, blocked,
    cancel: () => { dismissed.current = true; blocked.current = true; setShow(false) },
    skip: () => { dismissed.current = true; setShow(false); onNext.current() },
  }
}
