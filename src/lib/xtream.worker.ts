// The parse worker. Parses and maps one Xtream part off the main thread: on a TV, JSON.parse of a 40 MB movie list freezes the screen for seconds.
// Also builds the channel logo index (logos.ts): parse of channel-logos.json + ~40k cleaned names.
import { mapXtream } from "./xtream-map.ts"
import { buildLogoIndex, type LogoIndex, type LogoRow } from "./logos-pure.ts"

export type Ask = { n: number; sourceId: string; kind: "live" | "movie" | "series"; cats: ArrayBuffer; list: ArrayBuffer }
type Ping = { n: 0 } // startup check from xtream.ts, answered before any part is sent
export type LogoAsk = { logos: ArrayBuffer }
export type LogoAnswer = { ix?: LogoIndex; error?: string } // Maps and shared row arrays survive the structured clone as they are
export type Answer = { n: number; items?: ReturnType<typeof mapXtream>; error?: string }

self.onmessage = (e: MessageEvent<Ask | Ping | LogoAsk>) => {
  if ("logos" in e.data) {
    let a: LogoAnswer
    try { a = { ix: buildLogoIndex(JSON.parse(new TextDecoder().decode(e.data.logos)) as LogoRow[]) } }
    catch (err) { a = { error: err instanceof Error ? err.message : String(err) } }
    return self.postMessage(a)
  }
  if (!("cats" in e.data)) return self.postMessage({ n: 0 })
  const { n, sourceId, kind, cats, list } = e.data
  const dec = new TextDecoder()
  let a: Answer
  try { a = { n, items: mapXtream(sourceId, kind, JSON.parse(dec.decode(cats)), JSON.parse(dec.decode(list))) } }
  catch (err) { a = { n, error: err instanceof Error ? err.message : String(err) } }
  self.postMessage(a)
}
