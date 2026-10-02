import { useEffect, useState, type RefObject } from "react"

const EV = ["timeupdate", "durationchange", "emptied", "seeked", "loadedmetadata"] as const

/** Current time + duration of the video, kept out of Player so a timeupdate only re-renders the component that shows it. */
export function useVideoTime(vref: RefObject<HTMLVideoElement | null>, on = true) {
  const [t, setT] = useState({ cur: 0, dur: 0 })
  useEffect(() => {
    const v = vref.current
    if (!v || !on) return
    const f = () => setT((p) => {
      const cur = v.currentTime || 0, dur = isFinite(v.duration) ? v.duration || 0 : 0
      return p.cur === cur && p.dur === dur ? p : { cur, dur }
    })
    f()
    EV.forEach((e) => v.addEventListener(e, f))
    return () => EV.forEach((e) => v.removeEventListener(e, f))
  }, [vref, on])
  return t
}
