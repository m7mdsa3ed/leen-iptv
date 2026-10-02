import { useEffect, type RefObject } from "react"
import { shiftVtt } from "@/lib/jellyfin-pure"

/** Shows WebVTT text as a native subtitle track (re-made when the offset changes). null = no track. */
export function useSidecar(vref: RefObject<HTMLVideoElement | null>, vtt: string | null, offset: number) {
  useEffect(() => {
    const v = vref.current
    if (!v || vtt === null) return
    const url = URL.createObjectURL(new Blob([shiftVtt(vtt, offset)], { type: "text/vtt" }))
    const el = document.createElement("track")
    el.kind = "subtitles"; el.src = url
    v.appendChild(el)
    const show = () => { el.track.mode = "showing" }
    show(); v.addEventListener("loadedmetadata", show) // a new stream (quality / audio change) reloads the element
    return () => { v.removeEventListener("loadedmetadata", show); el.remove(); URL.revokeObjectURL(url) }
  }, [vref, vtt, offset])
}
