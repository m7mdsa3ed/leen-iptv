import { useEffect, useRef, useState, type RefObject } from "react"
import { plexSegments } from "@/lib/plex"
import { jellyfinSegments } from "@/lib/jellyfin"
import type { Item } from "@/lib/types"
import type { SourceMeta } from "@/lib/sources"
import type { Seg } from "@/lib/plex-pure"

/** Plex / Jellyfin episodes: the intro, recap or credits segment the playhead is in (null elsewhere), and `skip` to jump past it. */
export function useSegments(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; plex: SourceMeta | null; jf: SourceMeta | null }) {
  const { vref, item, live, plex, jf } = o
  const segs = useRef<Seg[]>([])
  const [seg, setSeg] = useState<Seg | null>(null)
  useEffect(() => {
    segs.current = []; setSeg(null)
    if (live || !(plex || jf) || !item.id.includes("|ep|")) return
    let on = true
    void (plex ? plexSegments(plex, item) : jellyfinSegments(jf!, item)).then((r) => { if (on) segs.current = r }, () => {})
    const v = vref.current
    const f = () => {
      if (!v) return
      const c = v.currentTime, s = segs.current.find((x) => c >= x.start && c < x.end - 1) ?? null
      setSeg((p) => (p === s || (p && s && p.start === s.start && p.kind === s.kind) ? p : s))
    }
    v?.addEventListener("timeupdate", f)
    return () => { on = false; v?.removeEventListener("timeupdate", f) }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return { seg, skip: () => { const v = vref.current; if (v && seg) v.currentTime = seg.end } }
}
