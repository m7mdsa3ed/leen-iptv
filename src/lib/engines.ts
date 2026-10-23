import type Hls from "hls.js"
import type mpegts from "mpegts.js"
import hlsUrl from "hls.js/dist/hls.min.js?url"
import mpegtsUrl from "mpegts.js/dist/mpegts.js?url"

/** hls.js + mpegts.js (~830 KB, almost half the app) stay out of the startup bundle: an old TV would parse them before the first frame.
    Their UMD builds are loaded as classic scripts (file:// can't split an IIFE bundle), each one on the first playback that needs it, then reused. */
export type Engines = { Hls: typeof Hls; mpegts: typeof mpegts }

const load = (src: string) => new Promise<void>((ok, bad) => {
  const s = document.createElement("script")
  s.src = src
  s.onload = () => ok()
  s.onerror = () => { s.remove(); bad(new Error(`Could not load ${src}`)) }
  document.head.appendChild(s)
})

const got: Partial<Engines> = {}
let hlsP: Promise<Engines["Hls"]> | undefined
let mpP: Promise<Engines["mpegts"]> | undefined
const w = () => window as unknown as Engines

/** The engines loaded so far (none, one or both). */
export const loadedEngines = (): Partial<Engines> => ({ ...got })
export const engines = () => (got.Hls && got.mpegts ? { Hls: got.Hls, mpegts: got.mpegts } : undefined)
export const loadHls = () => (hlsP ??= load(hlsUrl).then(
  () => (got.Hls = w().Hls),
  (e) => { hlsP = undefined; throw e }, // a later play retries
))
export const loadMpegts = () => (mpP ??= load(mpegtsUrl).then(
  () => (got.mpegts = w().mpegts),
  (e) => { mpP = undefined; throw e },
))
/** Both engines (Diagnostics). */
export const loadEngines = () => Promise.all([loadHls(), loadMpegts()]).then(([Hls, mpegts]): Engines => ({ Hls, mpegts }))
