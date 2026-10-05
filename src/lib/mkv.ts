// Embedded MKV text subtitles read straight from the file with small range requests (parser in mkv-pure.ts).
import { BLOCK_LEAD, BLOCK_SLACK, ID, addSeeks, findBlock, frameText, header, isTextCodec, parseCues, parseHead, parseScale, parseTracks, toVtt, unstrip } from "./mkv-pure.ts"

/** Bytes [from, to] (inclusive) of the file. */
export type GetRange = (from: number, to: number) => Promise<Uint8Array>

const WORKERS = 4 // browsers open 6 connections per host: leave room for the video itself

/** Whole element at absolute `pos` (header read first when it is larger than 12 bytes). */
async function element(get: GetRange, pos: number): Promise<Uint8Array> {
  const h = await get(pos, pos + 11)
  const e = header(h, 0)
  if (!e) throw new Error("mkv: bad element")
  return e.end <= h.length ? h.slice(0, e.end) : get(pos, pos + e.end - 1)
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b.slice()]).stream().pipeThrough(new DecompressionStream("deflate"))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

/** Subtitle track `streamIndex` (order of tracks in the file = Plex/ffmpeg stream index) as WebVTT.
    Cues near `startAt` (seconds) load first; onUpdate gets the partial text as it fills in; resolves with the full text. */
export async function mkvSubtitle(get: GetRange, streamIndex: number, o: { startAt?: number; alive: () => boolean; onUpdate: (vtt: string) => void }): Promise<string> {
  const head = parseHead(await get(0, 65535))
  if (!head) throw new Error("mkv: not a Matroska file")
  const { seg, seek } = head
  if (!seek.has(ID.Cues) && seek.has(ID.SeekHead)) { // mkvmerge may list Cues in a second SeekHead at the end
    const sh = await element(get, seg + seek.get(ID.SeekHead)!)
    addSeeks(sh, header(sh, 0)!, seek)
  }
  const at = (id: number) => (seek.has(id) ? seg + seek.get(id)! : undefined)
  const tracksAt = at(ID.Tracks), cuesAt = at(ID.Cues), infoAt = at(ID.Info)
  if (tracksAt === undefined || cuesAt === undefined) throw new Error("mkv: no index")
  const [tracksB, cuesB, infoB] = await Promise.all([element(get, tracksAt), element(get, cuesAt), infoAt === undefined ? null : element(get, infoAt)])
  const tr = parseTracks(tracksB)[streamIndex]
  if (!tr || tr.type !== 17 || !isTextCodec(tr.codec)) throw new Error("mkv: not a text subtitle")
  if (tr.comp && tr.comp.algo !== 0 && tr.comp.algo !== 3) throw new Error("mkv: unsupported compression")
  const refs = parseCues(cuesB, tr.num)
  if (!refs.length) throw new Error("mkv: subtitle track not indexed")
  const scale = infoB ? parseScale(infoB) : 1_000_000
  const sec = (t: number) => (t * scale) / 1e9
  const start = o.startAt ?? 0
  const order = refs.slice().sort((a, b) => Math.abs(sec(a.time) - start) - Math.abs(sec(b.time) - start))

  const cues: { start: number; end?: number; text: string }[] = []
  let next = 0, done = 0, shown = 0
  const worker = async () => {
    while (next < order.length && o.alive()) {
      const r = order[next++]
      try {
        const from = seg + r.cluster + BLOCK_LEAD + r.rel
        let b = await get(from, from + BLOCK_SLACK + 2047)
        let f = findBlock(b, tr.num)
        if (f && "need" in f) { b = await get(from, from + b.length + f.need - 1); f = findBlock(b, tr.num) }
        if (f && "frame" in f) {
          const bytes = tr.comp?.algo === 3 ? unstrip(f.frame, tr.comp.settings) : tr.comp ? await inflate(f.frame) : f.frame
          const dur = f.dur ?? r.dur
          cues.push({ start: sec(r.time), end: dur ? sec(r.time + dur) : undefined, text: frameText(tr.codec, new TextDecoder().decode(bytes)) })
        }
      } catch { /* one unreadable block: skip it */ }
      done++
      if (done === 20 || done - shown >= 150) { shown = done; if (o.alive()) o.onUpdate(toVtt(cues)) }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker))
  return toVtt(cues)
}
