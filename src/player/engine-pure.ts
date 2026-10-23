/** Playback engine decisions, pure (node scripts/engine.check.ts): which engine plays a URL, and what each kind of failure does.
    engine.ts applies them; nothing here touches the DOM or hls.js / mpegts.js. */

export type EngineKind = "hls" | "mpegts" | "native"

/** Judged on the raw (unproxied) URL: the proxy wraps it in /p?url=. */
export const isHlsUrl = (raw: string) => /\.m3u8(\?|$)/i.test(raw) || /[?&]output=m3u8/i.test(raw)

/** hls.js for playlists (and for a URL whose native playback failed: some servers 302 a .mp4 to a playlist), mpegts.js for live TS, else the <video> itself. */
export function pickEngine(o: { raw: string; live: boolean; viaHls: boolean; hls: boolean; mpegts: boolean }): EngineKind {
  if ((o.viaHls || isHlsUrl(o.raw)) && o.hls) return "hls"
  if (o.live && o.mpegts) return "mpegts"
  return "native"
}

/** The engine script to load before `pickEngine` can decide, or null when it can decide now. `has` = isSupported() of a loaded script,
    undefined = not loaded yet (assumed supported until it is). Loading only what the pick needs gives the same choice as having both. */
export function engineToLoad(o: { raw: string; live: boolean; viaHls: boolean }, has: { hls?: boolean; mpegts?: boolean }): "hls" | "mpegts" | null {
  const k = pickEngine({ ...o, hls: has.hls ?? true, mpegts: has.mpegts ?? true })
  return k !== "native" && has[k] === undefined ? k : null
}

/** Why playback stopped for good; engine.ts turns it into the sentence (statusMsg / corsHint / errors.*). `account` = worth asking an Xtream server whether the account is at its connection limit. */
export type Fail =
  | { why: "http"; code: number; account: true }
  | { why: "cors" | "decode" | "unavailable" | "offline" | "stuck" | "format" | "corrupt" | "cannot"; account: boolean }
  | { why: "blocked"; host: string; account: false }

export const MAX_TRIES = 3 // recoveries per outage (hls network / media, mpegts)
export const MAX_AUTO = 2 // watchdog restarts before "stuck"
export const watchdogMs = (live: boolean) => (live ? 15000 : 25000) // connected but nothing played: restart
export const ZAP_DELAY = 300 // zapping fast (CH+ held): only the channel you settle on opens a connection

export type HlsErr = { type: "network" | "media" | "other"; code?: number; blocked?: string }
export type HlsAct = { do: "proxy" } | { do: "restart" } | { do: "recover" } | { do: "fail"; fail: Fail }

/** A fatal hls.js error. `tries` = recoveries spent in this outage (reset by every buffered fragment); `direct` = the manifest was fetched without the proxy;
    `parsed` = a manifest was read. 4xx never fixes itself, so it fails at once; a direct manifest that could not be fetched at all goes through the proxy once. */
export function hlsAction(e: HlsErr, o: { tries: number; direct: boolean; parsed: boolean }): HlsAct {
  const http = !!e.code && e.code >= 400
  if (o.direct && e.type === "network" && !http && !o.parsed) return { do: "proxy" }
  if (e.type === "network" && !http && o.tries < MAX_TRIES) return { do: "restart" }
  if (e.type === "media" && o.tries < MAX_TRIES) return { do: "recover" }
  if (e.code === 403 && e.blocked) return { do: "fail", fail: { why: "blocked", host: e.blocked, account: false } } // Cloudflare, not the account
  if (http) return { do: "fail", fail: { why: "http", code: e.code!, account: true } }
  return { do: "fail", fail: { why: e.type === "network" ? "cors" : e.type === "media" ? "decode" : "unavailable", account: true } }
}

/** A mpegts.js error: retry after a growing pause (1s, 2s, 3s), unless the server answered with an HTTP error. */
export function mpegtsAction(code: number | undefined, tries: number): { do: "retry"; ms: number } | { do: "fail"; fail: Fail } {
  if (code && code >= 400) return { do: "fail", fail: { why: "http", code, account: true } }
  if (tries < MAX_TRIES) return { do: "retry", ms: 1000 * (tries + 1) }
  return { do: "fail", fail: { why: "offline", account: true } }
}

/** The <video> failed natively: a media server's direct file falls back to its transcoder; a VOD URL gets one try through hls.js
    (a .mp4 that redirects to a playlist); anything else is the media error code (3 = decode, 4 = format). */
export function nativeAction(o: { fallback: boolean; live: boolean; usedHls: boolean; triedHls: boolean; hlsOk: boolean; code?: number }): { do: "fallback" } | { do: "hls" } | { do: "fail"; fail: Fail } {
  if (o.fallback) return { do: "fallback" }
  if (!o.live && !o.usedHls && !o.triedHls && o.hlsOk) return { do: "hls" }
  return { do: "fail", fail: { why: o.code === 4 ? "format" : o.code === 3 ? "corrupt" : "cannot", account: true } }
}
