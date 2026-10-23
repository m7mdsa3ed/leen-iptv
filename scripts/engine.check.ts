// node scripts/engine.check.ts - player engine decisions (src/player/engine-pure.ts)
import assert from "node:assert/strict"
import { engineToLoad, hlsAction, isHlsUrl, mpegtsAction, nativeAction, pickEngine } from "../src/player/engine-pure.ts"

// engine choice: playlists -> hls.js, live TS -> mpegts.js, files -> native; a failed native URL retried through hls.js
assert.equal(isHlsUrl("http://x/live/a/b/1.m3u8"), true)
assert.equal(isHlsUrl("http://x/play?id=1&output=m3u8"), true)
assert.equal(isHlsUrl("http://x/movie/a/b/1.mp4"), false)
const has = { hls: true, mpegts: true }
assert.equal(pickEngine({ raw: "http://x/1.m3u8", live: true, viaHls: false, ...has }), "hls")
assert.equal(pickEngine({ raw: "http://x/1.ts", live: true, viaHls: false, ...has }), "mpegts")
assert.equal(pickEngine({ raw: "http://x/1.mp4", live: false, viaHls: false, ...has }), "native")
assert.equal(pickEngine({ raw: "http://x/1.mp4", live: false, viaHls: true, ...has }), "hls")
assert.equal(pickEngine({ raw: "http://x/1.m3u8", live: false, viaHls: false, hls: false, mpegts: true }), "native") // Safari-like: native HLS

// only the script the pick needs is loaded; the choice is the same as with both loaded
const hlsLive = { raw: "http://x/1.m3u8", live: true, viaHls: false }, tsLive = { raw: "http://x/1.ts", live: true, viaHls: false }, mp4 = { raw: "http://x/1.mp4", live: false, viaHls: false }
assert.equal(engineToLoad(hlsLive, {}), "hls")
assert.equal(engineToLoad(tsLive, {}), "mpegts")
assert.equal(engineToLoad(mp4, {}), null) // native VOD loads nothing
assert.equal(engineToLoad({ ...mp4, viaHls: true }, {}), "hls") // native failed: hls.js loaded lazily
assert.equal(engineToLoad(hlsLive, { hls: true }), null)
assert.equal(engineToLoad(hlsLive, { hls: false }), "mpegts") // hls.js unsupported: live falls to mpegts.js, as before
assert.equal(engineToLoad(hlsLive, { hls: false, mpegts: true }), null)
assert.equal(engineToLoad(tsLive, { hls: true }), "mpegts")
assert.equal(engineToLoad(tsLive, { mpegts: false }), null) // -> native
for (const o of [hlsLive, tsLive, mp4, { ...mp4, viaHls: true }]) for (const h of [true, false]) for (const m of [true, false]) {
  const both = pickEngine({ ...o, hls: h, mpegts: m })
  // load step by step, then pick with what is loaded (a missing script = unsupported, as engine.ts does)
  const has: { hls?: boolean; mpegts?: boolean } = {}
  for (let k = engineToLoad(o, has); k; k = engineToLoad(o, has)) has[k] = k === "hls" ? h : m
  assert.equal(pickEngine({ ...o, hls: !!has.hls, mpegts: !!has.mpegts }), both)
}

// hls.js: direct manifest unreachable -> proxy once; network/media errors recover 3 times; 4xx fails at once
const net = { type: "network" as const }
assert.deepEqual(hlsAction(net, { tries: 0, direct: true, parsed: false }), { do: "proxy" })
assert.deepEqual(hlsAction(net, { tries: 0, direct: true, parsed: true }), { do: "restart" })
assert.deepEqual(hlsAction(net, { tries: 2, direct: false, parsed: true }), { do: "restart" })
assert.deepEqual(hlsAction(net, { tries: 3, direct: false, parsed: true }), { do: "fail", fail: { why: "cors", account: true } })
assert.deepEqual(hlsAction({ type: "media" }, { tries: 0, direct: false, parsed: true }), { do: "recover" })
assert.deepEqual(hlsAction({ type: "media" }, { tries: 3, direct: false, parsed: true }), { do: "fail", fail: { why: "decode", account: true } })
assert.deepEqual(hlsAction({ type: "network", code: 404 }, { tries: 0, direct: true, parsed: false }), { do: "fail", fail: { why: "http", code: 404, account: true } })
assert.deepEqual(hlsAction({ type: "network", code: 403, blocked: "cdn.example" }, { tries: 0, direct: false, parsed: true }), { do: "fail", fail: { why: "blocked", host: "cdn.example", account: false } })

// mpegts.js: growing retries, HTTP errors final
assert.deepEqual(mpegtsAction(undefined, 0), { do: "retry", ms: 1000 })
assert.deepEqual(mpegtsAction(undefined, 2), { do: "retry", ms: 3000 })
assert.deepEqual(mpegtsAction(undefined, 3), { do: "fail", fail: { why: "offline", account: true } })
assert.deepEqual(mpegtsAction(502, 0), { do: "fail", fail: { why: "http", code: 502, account: true } })

// native: media-server file -> transcoder; VOD gets one hls.js try; else the media error code
const base = { fallback: false, live: false, usedHls: false, triedHls: false, hlsOk: true }
assert.deepEqual(nativeAction({ ...base, fallback: true }), { do: "fallback" })
assert.deepEqual(nativeAction(base), { do: "hls" })
assert.deepEqual(nativeAction({ ...base, triedHls: true, code: 4 }), { do: "fail", fail: { why: "format", account: true } })
assert.deepEqual(nativeAction({ ...base, live: true, code: 3 }), { do: "fail", fail: { why: "corrupt", account: true } })
assert.deepEqual(nativeAction({ ...base, usedHls: true }), { do: "fail", fail: { why: "cannot", account: true } })

console.log("engine ok")
