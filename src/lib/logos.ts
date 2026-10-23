import { addLogoRows, emptyLogoIndex, sealLogoIndex, type LogoIndex, type LogoRow } from "./logos-pure"
import ParseWorker from "./xtream.worker?worker&inline"
import type { LogoAnswer } from "./xtream.worker"

/** Main-thread fallback: indexed 2000 rows per task, since the whole file at once freezes a TV CPU for a second or two. */
const sliced = (buf: ArrayBuffer) => new Promise<LogoIndex | null>((res) => {
  let rows: LogoRow[]
  try { rows = JSON.parse(new TextDecoder().decode(buf)) as LogoRow[] } catch { return res(null) }
  const out = emptyLogoIndex()
  const step = (i: number) => {
    addLogoRows(out, rows.slice(i, i + 2000))
    if (i + 2000 < rows.length) setTimeout(step, 0, i + 2000)
    else res(sealLogoIndex(out))
  }
  step(0)
})

/** Parse + index in a short-lived worker (the Xtream parse worker module). undefined = it could not start or died: index here instead. */
const viaWorker = (buf: ArrayBuffer) => new Promise<LogoIndex | null | undefined>((res) => {
  let w: Worker
  try { w = new ParseWorker() } catch { return res(undefined) }
  const done = (v: LogoIndex | null | undefined) => { w.terminate(); res(v) }
  w.onerror = () => done(undefined)
  w.onmessage = (e: MessageEvent<LogoAnswer>) => done(e.data.ix ?? null) // error = bad JSON: this thread would fail the same way
  w.postMessage({ logos: buf.slice(0) }) // a copy (3 MB, ~1 ms): the fallback still needs the bytes if the worker dies
})

let ix: Promise<LogoIndex | null> | undefined
/**
 * The bundled channel logo index (public/channel-logos.json, ~3 MB), loaded once on first use. XHR, not fetch: the packaged TV app runs from file://.
 * Parsed and indexed in a worker (~40k cleaned names cost seconds on a TV CPU; the index comes back as one structured clone); in slices here when no worker starts.
 */
export const loadLogoIndex = (): Promise<LogoIndex | null> =>
  (ix ??= new Promise((res) => {
    const x = new XMLHttpRequest()
    x.open("GET", "./channel-logos.json")
    x.responseType = "arraybuffer"
    x.onload = () => {
      const buf = x.response as ArrayBuffer | null
      if (!buf) return res(null)
      viaWorker(buf).then((v) => (v === undefined ? sliced(buf) : v)).then(res)
    }
    x.onerror = () => res(null) // no logos is fine: channels keep their initials
    x.send()
  }))
