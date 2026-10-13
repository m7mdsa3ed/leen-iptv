import type Hls from "hls.js"
import type mpegts from "mpegts.js"
import hlsUrl from "hls.js/dist/hls.min.js?url"
import mpegtsUrl from "mpegts.js/dist/mpegts.js?url"

/** hls.js + mpegts.js (~830 KB, almost half the app) stay out of the startup bundle: an old TV would parse them before the first frame.
    Their UMD builds are loaded as classic scripts (file:// can't split an IIFE bundle) on first playback, then reused. */
export type Engines = { Hls: typeof Hls; mpegts: typeof mpegts }

const load = (src: string) => new Promise<void>((ok, bad) => {
  const s = document.createElement("script")
  s.src = src
  s.onload = () => ok()
  s.onerror = () => { s.remove(); bad(new Error(`Could not load ${src}`)) }
  document.head.appendChild(s)
})

let ready: Engines | undefined
let pending: Promise<Engines> | undefined
export const engines = () => ready
export const loadEngines = () => (pending ??= Promise.all([load(hlsUrl), load(mpegtsUrl)]).then(
  () => { const w = window as unknown as Engines; return (ready = { Hls: w.Hls, mpegts: w.mpegts }) },
  (e) => { pending = undefined; throw e }, // a later play retries
))
