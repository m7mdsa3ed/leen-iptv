// Minimal Matroska (EBML) reader for text subtitles: enough to find a subtitle track's blocks through the Cues index and read
// them one small range request each, so an embedded subtitle loads without downloading the video. Pure: no fetch, no DOM.
// ponytail: needs Cues entries for the subtitle track (mkvmerge writes them, with CueRelativePosition); files without them get none.

export const ID = {
  Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimecodeScale: 0x2ad7b1, Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackType: 0x83, CodecID: 0x86,
  ContentEncodings: 0x6d80, ContentEncoding: 0x6240, ContentCompression: 0x5034, ContentCompAlgo: 0x4254, ContentCompSettings: 0x4255,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1, CueRelativePosition: 0xf0, CueDuration: 0xb2,
  SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1, BlockDuration: 0x9b,
}

type El = { id: number; start: number; data: number; size: number; end: number } // offsets inside the buffer

/** EBML variable-length int at `p`: { len, value }. keepMarker = element ids keep their length bit. null when invalid / past the end. */
export function vint(b: Uint8Array, p: number, keepMarker = false): { len: number; value: number } | null {
  if (p >= b.length) return null
  const first = b[p]
  let len = 1
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
  if (len > 8 || p + len > b.length) return null
  let v = keepMarker ? first : first & (0xff >> len)
  for (let i = 1; i < len; i++) v = v * 256 + b[p + i]
  return { len, value: v }
}

/** Element header at `p` (id + size). Unknown sizes (all ones) run to the end of the buffer. */
export function header(b: Uint8Array, p: number): El | null {
  const id = vint(b, p, true)
  if (!id || id.len > 4) return null
  const sz = vint(b, p + id.len)
  if (!sz) return null
  const data = p + id.len + sz.len
  const unknown = sz.value === 2 ** (7 * sz.len) - 1
  const size = unknown ? b.length - data : sz.value
  return { id: id.value, start: p, data, size, end: data + size }
}

/** Children of [from, to). Stops at the first unparsable or truncated element. */
export function children(b: Uint8Array, from: number, to: number): El[] {
  const out: El[] = []
  for (let p = from; p < Math.min(to, b.length); ) {
    const e = header(b, p)
    if (!e || e.end > to) break
    out.push(e)
    p = e.end
  }
  return out
}

export const uint = (b: Uint8Array, e: El) => { let v = 0; for (let i = e.data; i < e.end; i++) v = v * 256 + b[i]; return v }
const str = (b: Uint8Array, e: El) => new TextDecoder().decode(b.subarray(e.data, e.end)).replace(/\0+$/, "")
const child = (b: Uint8Array, e: El, id: number) => children(b, e.data, e.end).find((c) => c.id === id)

/** File head: where the Segment's data starts (absolute) and the SeekHead entries (id -> position relative to that start). */
export function parseHead(b: Uint8Array): { seg: number; seek: Map<number, number> } | null {
  const top = children(b, 0, b.length)
  const segEl = top.find((e) => e.id === ID.Segment) ?? (() => { // the Segment is usually larger than the head we read: take its header only
    const ebml = top[0]
    return ebml ? header(b, ebml.end) : null
  })()
  if (!segEl || segEl.id !== ID.Segment) return null
  const seek = new Map<number, number>()
  for (const e of children(b, segEl.data, b.length)) if (e.id === ID.SeekHead) addSeeks(b, e, seek)
  return { seg: segEl.data, seek }
}

/** SeekHead -> map (first entry wins; a second SeekHead is listed under its own id). */
export function addSeeks(b: Uint8Array, sh: El, seek: Map<number, number>) {
  for (const s of children(b, sh.data, sh.end)) {
    if (s.id !== ID.Seek) continue
    const idEl = child(b, s, ID.SeekID), posEl = child(b, s, ID.SeekPosition)
    if (!idEl || !posEl) continue
    const id = vint(b, idEl.data, true)?.value
    if (id !== undefined && !seek.has(id)) seek.set(id, uint(b, posEl))
  }
}

export type MkvTrack = { num: number; type: number; codec: string; comp?: { algo: number; settings?: Uint8Array } }

/** Tracks element body (buffer = the element, from its header) -> tracks in file order (= Plex/ffmpeg stream index). */
export function parseTracks(b: Uint8Array): MkvTrack[] {
  const tr = header(b, 0)
  if (!tr || tr.id !== ID.Tracks) return []
  return children(b, tr.data, tr.end).filter((e) => e.id === ID.TrackEntry).map((te) => {
    const n = child(b, te, ID.TrackNumber), ty = child(b, te, ID.TrackType), c = child(b, te, ID.CodecID)
    const enc = child(b, te, ID.ContentEncodings), ce = enc && child(b, enc, ID.ContentEncoding), cc = ce && child(b, ce, ID.ContentCompression)
    const algo = cc && child(b, cc, ID.ContentCompAlgo), set = cc && child(b, cc, ID.ContentCompSettings)
    return {
      num: n ? uint(b, n) : 0, type: ty ? uint(b, ty) : 0, codec: c ? str(b, c) : "",
      ...(cc ? { comp: { algo: algo ? uint(b, algo) : 0, settings: set ? b.slice(set.data, set.end) : undefined } } : {}),
    }
  })
}

/** Info element -> TimecodeScale in ns (default 1 ms). */
export function parseScale(b: Uint8Array): number {
  const info = header(b, 0)
  const s = info && info.id === ID.Info ? child(b, info, ID.TimecodeScale) : undefined
  return s ? uint(b, s) : 1_000_000
}

export type CueRef = { time: number; cluster: number; rel: number; dur?: number } // time/dur in TimecodeScale units, cluster relative to the Segment data

/** Cues element -> the entries for one track that can be fetched on their own (need CueRelativePosition). */
export function parseCues(b: Uint8Array, track: number): CueRef[] {
  const cues = header(b, 0)
  if (!cues || cues.id !== ID.Cues) return []
  const out: CueRef[] = []
  for (const cp of children(b, cues.data, cues.end)) {
    if (cp.id !== ID.CuePoint) continue
    const t = child(b, cp, ID.CueTime)
    for (const tp of children(b, cp.data, cp.end)) {
      if (tp.id !== ID.CueTrackPositions) continue
      const tr = child(b, tp, ID.CueTrack), cl = child(b, tp, ID.CueClusterPosition), rel = child(b, tp, ID.CueRelativePosition), d = child(b, tp, ID.CueDuration)
      if (t && tr && cl && rel && uint(b, tr) === track) out.push({ time: uint(b, t), cluster: uint(b, cl), rel: uint(b, rel), ...(d ? { dur: uint(b, d) } : {}) })
    }
  }
  return out
}

/** Bytes before the block to read so one request covers any Cluster header length (4-byte id + 1..8-byte size). */
export const BLOCK_LEAD = 5
export const BLOCK_SLACK = 7

/** A window read from (cluster + BLOCK_LEAD + rel): the block of `track` at offset 0..BLOCK_SLACK. `need` = bytes missing when truncated. */
export function findBlock(b: Uint8Array, track: number): { frame: Uint8Array; dur?: number } | { need: number; at: number } | null {
  for (let k = 0; k <= BLOCK_SLACK; k++) {
    const e = header(b, k)
    if (!e || (e.id !== ID.SimpleBlock && e.id !== ID.BlockGroup) || e.size > 1 << 20) continue
    if (e.end > b.length) {
      // only trust a truncated candidate when its track number already matches
      const blk = e.id === ID.SimpleBlock ? e.data : (header(b, e.data)?.id === ID.Block ? header(b, e.data)!.data : -1)
      if (blk >= 0 && vint(b, blk)?.value === track) return { need: e.end - b.length, at: k }
      continue
    }
    const blockEl = e.id === ID.SimpleBlock ? e : child(b, e, ID.Block)
    if (!blockEl) continue
    const tn = vint(b, blockEl.data)
    if (!tn || tn.value !== track) continue
    const frameAt = blockEl.data + tn.len + 3 // int16 timecode + flags (text subtitles are never laced)
    if (frameAt > blockEl.end) continue
    const d = e.id === ID.BlockGroup ? child(b, e, ID.BlockDuration) : undefined
    return { frame: b.slice(frameAt, blockEl.end), ...(d ? { dur: uint(b, d) } : {}) }
  }
  return null
}

/** Header-stripping compression (algo 3): the stripped bytes go back in front. zlib (algo 0) is undone by the caller. */
export const unstrip = (frame: Uint8Array, settings?: Uint8Array) => {
  if (!settings?.length) return frame
  const out = new Uint8Array(settings.length + frame.length)
  out.set(settings); out.set(frame, settings.length)
  return out
}

/** One subtitle frame -> cue text. ASS/SSA: Text field without override tags; SRT/WebVTT: as is. */
export function frameText(codec: string, text: string): string {
  let t = text
  if (/^S_TEXT\/(ASS|SSA)/i.test(codec) || /^S_(ASS|SSA)/i.test(codec)) {
    const parts = t.split(",")
    t = parts.length > 8 ? parts.slice(8).join(",") : t // ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    t = t.replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").replace(/\\h/g, " ")
  }
  return t.replace(/\r\n?/g, "\n").replace(/-->/g, "->").replace(/\n{2,}/g, "\n").trim()
}

export const isTextCodec = (codec: string) => /^S_TEXT\/(UTF8|ASCII|ASS|SSA|WEBVTT)/i.test(codec) || /^S_(ASS|SSA)$/i.test(codec)

const ts = (sec: number) => {
  const ms = Math.max(0, Math.round(sec * 1000))
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`
}

/** Cues (seconds) -> WebVTT text, sorted; a cue without a duration lasts until the next one (max 5 s). */
export function toVtt(cues: { start: number; end?: number; text: string }[]): string {
  const s = cues.filter((c) => c.text).sort((a, b) => a.start - b.start)
  return "WEBVTT\n\n" + s.map((c, i) => {
    const end = c.end ?? Math.min(c.start + 5, s[i + 1]?.start ?? c.start + 5)
    return `${ts(c.start)} --> ${ts(Math.max(end, c.start + 0.2))}\n${c.text}\n`
  }).join("\n")
}
