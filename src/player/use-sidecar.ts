import { useEffect, type RefObject } from "react"
import { shiftVtt } from "@/lib/jellyfin-pure"

/** id of the <track> this hook adds: the subtitle list leaves it out (it is the picked online / server text subtitle, not a track of the stream). */
export const SIDECAR_ID = "leen-sidecar"

/** Shows WebVTT text as a subtitle track, shifted by `offset` seconds (re-made when it changes). null = no track. */
export function useSidecar(vref: RefObject<HTMLVideoElement | null>, vtt: string | null, offset: number) {
  useEffect(() => {
    const v = vref.current
    if (!v || vtt === null) return
    const url = URL.createObjectURL(new Blob([shiftVtt(vtt, offset)], { type: "text/vtt" }))
    const el = document.createElement("track")
    el.kind = "subtitles"; el.id = SIDECAR_ID; el.src = url
    v.appendChild(el)
    const show = () => { el.track.mode = "showing" }
    show(); v.addEventListener("loadedmetadata", show) // a new stream (quality / audio change) reloads the element
    return () => { v.removeEventListener("loadedmetadata", show); el.remove(); URL.revokeObjectURL(url) }
  }, [vref, vtt, offset])
}
