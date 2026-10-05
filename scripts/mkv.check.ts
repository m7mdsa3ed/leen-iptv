// node scripts/mkv.check.ts: embedded MKV subtitles read through Cues with range requests (synthetic file, no network)
import assert from "node:assert/strict"
import { mkvSubtitle } from "../src/lib/mkv.ts"
import { ID, frameText, toVtt, vint } from "../src/lib/mkv-pure.ts"

// --- tiny EBML writer
const idBytes = (id: number) => { const o: number[] = []; for (let v = id; v > 0; v = Math.floor(v / 256)) o.unshift(v & 0xff); return o }
const size = (n: number, len = 0) => { // smallest (or fixed) length
  let l = len || 1
  while (!len && n >= 2 ** (7 * l) - 1) l++
  const o: number[] = []
  for (let i = l - 1, v = n; i >= 0; i--, v = Math.floor(v / 256)) o[i] = v & 0xff
  o[0] |= 0x80 >> (l - 1)
  return o
}
const el = (id: number, body: number[], sizeLen = 0) => [...idBytes(id), ...size(body.length, sizeLen), ...body]
const u = (id: number, v: number) => { const b: number[] = []; for (let x = v; ; x = Math.floor(x / 256)) { b.unshift(x & 0xff); if (x < 256) break } return el(id, b) }
const s = (id: number, t: string) => el(id, [...new TextEncoder().encode(t)])
const raw = (id: number, b: number[]) => el(id, b)
const block = (track: number, tc: number, payload: number[]) => [...size(track), (tc >> 8) & 0xff, tc & 0xff, 0x80, ...payload]

const SUB = 3, ASS = 4
const lines = [["Hello there", 1000, 1500], ["<i>Second</i> line", 4000, 2000], ["Third", 9000, 1000]] as const
const assLines = [["0,0,Default,,0,0,0,,{\\an8}Top\\Nline", 2000, 800]] as const

// Segment children laid out with fixed-size placeholders, positions computed in a second pass
function build() {
  const info = el(ID.Info, u(ID.TimecodeScale, 1_000_000))
  const tracks = el(ID.Tracks, [
    ...el(ID.TrackEntry, [...u(ID.TrackNumber, 1), ...u(ID.TrackType, 1), ...s(ID.CodecID, "V_MPEGH/ISO/HEVC")]),
    ...el(ID.TrackEntry, [...u(ID.TrackNumber, 2), ...u(ID.TrackType, 2), ...s(ID.CodecID, "A_AAC")]),
    ...el(ID.TrackEntry, [...u(ID.TrackNumber, SUB), ...u(ID.TrackType, 17), ...s(ID.CodecID, "S_TEXT/UTF8")]),
    ...el(ID.TrackEntry, [...u(ID.TrackNumber, ASS), ...u(ID.TrackType, 17), ...s(ID.CodecID, "S_TEXT/ASS"),
      ...el(ID.ContentEncodings, el(ID.ContentEncoding, el(ID.ContentCompression, [...u(ID.ContentCompAlgo, 3), ...raw(ID.ContentCompSettings, [...new TextEncoder().encode("0,")])])))]),
  ])
  // clusters: video junk around each subtitle block; cluster size written with 8 bytes (like mkvmerge), one with 2
  const clusters: number[][] = [], cues: { t: number; track: number; cl: number; rel: number; dur: number }[] = []
  const all = [...lines.map((l) => ({ track: SUB, text: l[0], t: l[1], d: l[2] })), ...assLines.map((l) => ({ track: ASS, text: l[0].slice(2), t: l[1], d: l[2] }))].sort((a, b) => a.t - b.t)
  all.forEach((x, i) => {
    const junk = el(ID.SimpleBlock, block(1, 0, Array(200000 + i * 777).fill(7)))
    const sub = el(ID.BlockGroup, [...el(ID.Block, block(x.track, 0, [...new TextEncoder().encode(x.text)])), ...u(ID.BlockDuration, x.d)])
    const body = [...u(0xe7, x.t), ...junk, ...sub, ...junk]
    const rel = u(0xe7, x.t).length + junk.length
    clusters.push(el(0x1f43b675, body, i === 1 ? 2 : 8))
    cues.push({ t: x.t, track: x.track, cl: -1, rel, dur: x.d })
  })
  return { info, tracks, clusters, cues }
}
const { info, tracks, clusters, cues } = build()
const seekEntry = (id: number, pos: number) => el(ID.Seek, [...raw(ID.SeekID, idBytes(id)), ...el(ID.SeekPosition, size(pos, 4).map((b, i) => (i === 0 ? b & 0x0f : b)))]) // 4-byte uint (high nibble cleared: not a vint)
const seekLen = el(ID.SeekHead, [...seekEntry(ID.Info, 0), ...seekEntry(ID.Tracks, 0), ...seekEntry(ID.Cues, 0)]).length
let pos = seekLen
const infoPos = pos; pos += info.length
const tracksPos = pos; pos += tracks.length
clusters.forEach((c, i) => { cues[i].cl = pos; pos += c.length })
const cuesEl = el(ID.Cues, cues.flatMap((c) => el(ID.CuePoint, [...u(ID.CueTime, c.t), ...el(ID.CueTrackPositions, [...u(ID.CueTrack, c.track), ...u(ID.CueClusterPosition, c.cl), ...u(ID.CueRelativePosition, c.rel), ...u(ID.CueDuration, c.dur)])])))
const cuesPos = pos
const seekHead = el(ID.SeekHead, [...seekEntry(ID.Info, infoPos), ...seekEntry(ID.Tracks, tracksPos), ...seekEntry(ID.Cues, cuesPos)])
assert.equal(seekHead.length, seekLen)
const segBody = [...seekHead, ...info, ...tracks, ...clusters.flat(), ...cuesEl]
const file = new Uint8Array([...el(0x1a45dfa3, s(0x4282, "matroska")), ...el(ID.Segment, segBody, 8)])

let requests = 0, bytes = 0
const get = async (a: number, b: number) => { requests++; const r = file.slice(a, Math.min(b, file.length - 1) + 1); bytes += r.length; return r }
const vtt = await mkvSubtitle(get, 2, { alive: () => true, onUpdate: () => {} })
assert.equal(vtt, "WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello there\n\n00:00:04.000 --> 00:00:06.000\n<i>Second</i> line\n\n00:00:09.000 --> 00:00:10.000\nThird\n")
assert.ok(bytes < file.length / 5, `read ${bytes} of ${file.length} bytes`)
const ass = await mkvSubtitle(get, 3, { alive: () => true, onUpdate: () => {} }) // header stripping puts "0," back
assert.equal(ass, "WEBVTT\n\n00:00:02.000 --> 00:00:02.800\nTop\nline\n")
await assert.rejects(mkvSubtitle(get, 0, { alive: () => true, onUpdate: () => {} })) // video track
let n = 0
await mkvSubtitle(get, 2, { alive: () => n++ < 1, onUpdate: () => {} }) // cancelled: stops early
assert.equal(vint(new Uint8Array([0x40, 0x02]), 0)?.value, 2)
assert.equal(frameText("S_TEXT/UTF8", "a\r\n\r\nb --> c"), "a\nb -> c")
assert.equal(toVtt([{ start: 3, text: "x" }, { start: 4, text: "y" }]), "WEBVTT\n\n00:00:03.000 --> 00:00:04.000\nx\n\n00:00:04.000 --> 00:00:09.000\ny\n")
console.log(`mkv subtitles ok (${requests} range requests, ${bytes}/${file.length} bytes)`)
