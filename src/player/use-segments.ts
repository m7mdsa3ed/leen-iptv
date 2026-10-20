import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { plexSegments } from "@/lib/plex"
import { jellyfinSegments } from "@/lib/jellyfin"
import type { Item } from "@/lib/types"
import type { SourceMeta } from "@/lib/sources"
import { borrowSegs } from "./borrow"
import { markSegs, mergeSegs, skipTo, type Mark, type PSeg } from "./skip-pure"

/** Episodes: the intro / recap / credits segment the playhead is in (null elsewhere), `skip` to jump past it, and `creditsAt` (where the Next card may come early).
    Layers (skip-pure): the server's own markers, the user's saved marks for the show, markers borrowed from a Plex/Jellyfin copy, the fixed "skip 85 s" jump. */
export function useSegments(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; plex: SourceMeta | null; jf: SourceMeta | null; mark?: Mark }) {
  const { vref, item, live, plex, jf, mark } = o
  const ep = !live && item.id.includes("|ep|")
  const [own, setOwn] = useState<PSeg[]>([])
  const [borrowed, setBorrowed] = useState<PSeg[]>([])
  const [dur, setDur] = useState(0)
  const [seg, setSeg] = useState<PSeg | null>(null)
  const segs = useMemo(() => (ep ? mergeSegs(own, markSegs(mark, dur), borrowed) : []), [ep, own, mark, dur, borrowed])
  const ref = useRef(segs)
  ref.current = segs

  useEffect(() => {
    setOwn([]); setBorrowed([]); setSeg(null); setDur(0)
    if (!ep) return
    let on = true
    if (plex || jf) void (plex ? plexSegments(plex, item) : jellyfinSegments(jf!, item)).then((r) => { if (on) setOwn(r) }, () => {})
    else void borrowSegs(item).then((r) => { if (on) setBorrowed(r) }, () => {})
    const v = vref.current
    const f = () => {
      if (!v) return
      const c = v.currentTime, s = ref.current.find((x) => c >= x.start && c < x.end - 1) ?? null
      setSeg((p) => (p === s || (p && s && p.start === s.start && p.kind === s.kind) ? p : s))
    }
    const d = () => setDur(v && v.duration > 0 && isFinite(v.duration) ? v.duration : 0)
    d()
    v?.addEventListener("timeupdate", f); v?.addEventListener("durationchange", d)
    return () => { on = false; v?.removeEventListener("timeupdate", f); v?.removeEventListener("durationchange", d) }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return { seg, creditsAt: segs.find((x) => x.kind === "credits")?.start, skip: () => { const v = vref.current; if (v && seg) v.currentTime = skipTo(seg, v.currentTime) } }
}
