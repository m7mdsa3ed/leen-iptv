// node scripts/plex.check.ts
import assert from "node:assert/strict"
import { buildUrl, mapDetail, mapMeta, photoUrl, sortConns, allowedConns, connKind, mapSegments } from "../src/lib/plex-pure.ts"

assert.equal(buildUrl("http://h:32400/", "/library/sections", { a: "x y" }, "T"), "http://h:32400/library/sections?a=x%20y&X-Plex-Token=T")
assert.equal(buildUrl("http://h", "/identity"), "http://h/identity")
assert.ok(photoUrl("http://h", "T", "/library/metadata/1/thumb/2", 300, 450).includes("url=%2Flibrary%2Fmetadata%2F1%2Fthumb%2F2"))

const order = sortConns([
  { uri: "https://relay", relay: true, protocol: "https" },
  { uri: "http://remote:1", local: false, protocol: "http" },
  { uri: "http://lan:1", local: true, protocol: "http" },
  { uri: "https://lan.plex.direct", local: true, protocol: "https" },
  { uri: "https://remote", local: false, protocol: "https" },
  { uri: "http://lan:1", local: true, protocol: "http" },
]).map((c) => c.uri)
assert.deepEqual(order, ["https://lan.plex.direct", "http://lan:1", "https://remote", "http://remote:1", "https://relay"])

const img = (p: string, w: number, h: number) => `IMG${w}x${h}${p}`
const movie = mapMeta(
  { ratingKey: "42", type: "movie", title: "Heat", year: 1995, originallyAvailableAt: "1995-12-15", addedAt: 1700000000, summary: "s", rating: 8.25, thumb: "/t", art: "/a", viewOffset: 61000, duration: 7200000, Genre: [{ tag: "Crime" }], Media: [{ Part: [{ container: "mkv" }] }] },
  { sourceId: "s1", group: "Movies", img },
)
assert.deepEqual(movie, { id: "s1|movie|42", kind: "movie", sid: "42", name: "Heat", group: "Movies", logo: "IMG300x450/t", backdrop: "IMG1280x720/a", plot: "s", rating: "8.3", year: "1995", released: "1995-12-15", added: 1700000000, genres: ["Crime"], resume: 61, dur: 7200, ext: "mkv", part: undefined, codecs: undefined })
assert.equal(mapMeta({ ratingKey: "7", type: "show", title: "X" }, { sourceId: "s1", group: "TV", img }).kind, "series")

const d = mapDetail({ summary: "p", year: 1995, duration: 7200000, Genre: [{ tag: "Crime" }], Director: [{ tag: "M" }], Role: [{ tag: "Al", role: "Hanna", thumb: "/p" }], Rating: [{ image: "imdb://image.rating", value: 8.3 }, { image: "rottentomatoes://image.rating.ripe", value: 8 }, { image: "other://", value: 1 }] }, img)
assert.deepEqual(d.meta.ratings.map((r) => r.source), ["IMDb", "Rotten Tomatoes"])
assert.equal(d.meta.cast[0].photo, "IMG200x200/p")
assert.equal(d.meta.runtime, 7200)
// connection modes: local = LAN only, norelay = no relay, auto = everything
const conns = [
  { uri: "https://1-2-3-4.abc.plex.direct:32400", local: false, relay: false, protocol: "https" },
  { uri: "http://192.168.1.5:32400", local: true, relay: false, protocol: "http" },
  { uri: "https://relay.plex.direct:8443", local: false, relay: true, protocol: "https" },
]
assert.equal(allowedConns(conns, "auto").length, 3)
assert.deepEqual(allowedConns(conns, "norelay").map((c) => c.uri), [conns[0].uri, conns[1].uri])
assert.deepEqual(allowedConns(conns, "local").map((c) => c.uri), [conns[1].uri])
assert.equal(sortConns(allowedConns(conns, "auto"))[0].uri, conns[1].uri) // local first
assert.equal(sortConns(allowedConns(conns, "auto"))[2].uri, conns[2].uri) // relay last
assert.equal(connKind(conns, "http://192.168.1.5:32400/"), "Local")
assert.equal(connKind(conns, conns[2].uri), "Relay")
assert.equal(connKind(conns, "http://elsewhere:1"), "Custom")
console.log("plex ok")

import { mapStreams as plexStreams } from "../src/lib/plex-pure.ts"
assert.deepEqual(plexStreams({ Media: [{ Part: [{ Stream: [{ streamType: 1, id: 1 }, { streamType: 2, id: 2, displayTitle: "English (AC3)", selected: true }, { streamType: 3, id: 3, displayTitle: "Arabic (SRT)", codec: "srt" }] }] }] }),
  { audio: [{ id: 2, label: "English (AC3)", def: true, lang: undefined }], subs: [{ id: 3, label: "Arabic (SRT)", def: false, lang: undefined, text: true }] })

// subtitles: SRT -> VTT, text vs image streams
import { srtToVtt, mapStreams } from "../src/lib/plex-pure.ts"
assert.equal(srtToVtt("﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHi\r\n"), "WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nHi\n")
assert.equal(srtToVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nx"), "WEBVTT\n\n00:01.000 --> 00:02.000\nx\n")
assert.equal(srtToVtt("[Script Info]\nDialogue: 0"), "")
const ms = mapStreams({ Media: [{ Part: [{ Stream: [{ id: 5, streamType: 3, codec: "srt", languageCode: "eng" }, { id: 6, streamType: 3, codec: "pgs" }] }] }] })
assert.deepEqual(ms.subs.map((x) => x.text), [true, false])

// custom remote address: added to the plex.tv list as a "remote" entry, replaced on edit, honoured by modes
import { isLanHost, withRemote, plexMode, firstReachable } from "../src/lib/plex-pure.ts"
assert.ok(isLanHost("http://192.168.1.5:32400") && isLanHost("http://10.0.0.2") && isLanHost("http://172.20.1.1:1") && isLanHost("http://nas.local:1") && isLanHost("http://plexbox:32400"))
assert.ok(!isLanHost("https://plex.example.com:32400") && !isLanHost("http://172.32.0.1") && !isLanHost("http://100.64.1.2:32400"))
assert.equal(plexMode("remote"), "auto"); assert.equal(plexMode("local"), "local"); assert.equal(plexMode(undefined), "auto")
const man = withRemote(undefined, "http://192.168.1.5:32400/", "https://plex.example.com:32400/")!
assert.deepEqual(man.map((c) => [c.uri, !!c.local]), [["http://192.168.1.5:32400", true], ["https://plex.example.com:32400", false]])
assert.equal(connKind(man, "https://plex.example.com:32400"), "Remote")
assert.deepEqual(allowedConns(man, "local").map((c) => c.uri), ["http://192.168.1.5:32400"])
assert.equal(allowedConns(man, "norelay").length, 2)
assert.equal(sortConns(allowedConns([...conns, man[1]], "auto")).at(-1)!.uri, conns[2].uri) // plex.tv relay stays last
assert.deepEqual(withRemote(man, "http://192.168.1.5:32400", "https://other.example.com", "https://plex.example.com:32400")!.map((c) => c.uri), ["http://192.168.1.5:32400", "https://other.example.com"])
assert.equal(withRemote(man, "http://192.168.1.5:32400", "", "https://plex.example.com:32400"), undefined) // remote removed from a manual source
assert.equal(withRemote(undefined, "http://192.168.1.5:32400", ""), undefined)
assert.equal(withRemote(conns, "x", "")!.length, conns.length) // plex.tv list untouched
// first reachable wins, failures are kept
const fr = await firstReachable(["a", "b", "c"], async (c) => { if (c !== "b") throw new Error(c) })
assert.equal(fr.cand, "b"); assert.equal(fr.errs.length, 1)
assert.equal((await firstReachable(["a"], async () => { throw new Error("x") })).cand, undefined)
console.log("plex remote ok")
assert.deepEqual(mapSegments({ Marker: [{ type: "intro", startTimeOffset: 1000, endTimeOffset: 31000 }, { type: "commercial", startTimeOffset: 0, endTimeOffset: 5 }, { type: "credits", startTimeOffset: 90000, endTimeOffset: 80000 }] }), [{ kind: "intro", start: 1, end: 31 }]); assert.deepEqual(mapSegments({}), [])
console.log("plex segments ok")

// direct play: file fields + canPlayType strings
import { fileOf, directType } from "../src/lib/plex-pure.ts"
const f = fileOf({ Media: [{ videoCodec: "hevc", audioCodec: "eac3", container: "mkv", Part: [{ key: "/library/parts/9/1/file.mkv", container: "mkv" }] }] })
assert.deepEqual(f, { ext: "mkv", part: "/library/parts/9/1/file.mkv", codecs: "hevc,eac3" })
assert.equal(directType(f.ext, f.codecs), 'video/mp4; codecs="hvc1.2.4.L153.B0, ec-3"')
assert.equal(directType("mp4", "h264,aac"), 'video/mp4; codecs="avc1.640033, mp4a.40.2"')
assert.equal(directType("mkv", "hevc,dts"), undefined) // dts/truehd -> transcoder
assert.equal(directType("avi", "h264,aac"), undefined)
assert.equal(directType(undefined, undefined), undefined)
console.log("plex direct play ok")

// watch history -> Watch entries
import { plexWatch } from "../src/lib/plex-pure.ts"
assert.deepEqual(plexWatch({ type: "movie", ratingKey: 7, duration: 6000000, viewCount: 1, lastViewedAt: 1700000000 }, "s1"), { id: "s1|movie|7", pos: 6000, dur: 6000, t: 1700000000000 })
assert.deepEqual(plexWatch({ type: "episode", ratingKey: 9, grandparentRatingKey: 3, duration: 2400000, viewCount: 2, viewOffset: 600000, lastViewedAt: 1 }, "s1"),
  { id: "s1|ep|9", pos: 600, dur: 2400, t: 1000, series: "s1|series|3" }) // rewatch in progress: the offset wins
assert.equal(plexWatch({ type: "movie", ratingKey: 7, duration: 6000000 }, "s1"), undefined) // never played
assert.equal(plexWatch({ type: "clip", ratingKey: 7, duration: 6000000, viewCount: 1 }, "s1"), undefined)
console.log("plex watch ok")
