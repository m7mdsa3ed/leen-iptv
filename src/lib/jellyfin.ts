// Jellyfin server as a source: username/password or Quick Connect sign-in, catalog (per library), live TV + guide when the
// server has it, detail, HLS URL, progress reporting. The token rides as api_key in the query so GETs stay CORS-simple.
import { AUDIO_CODECS, STREAM_QS, VIDEO_CODECS, type StreamQ } from "./quality"
import type { Episode, Item, Source, Watch } from "./types"
import { HttpError, fetchT, mixed, plexFetch, px, scanLan } from "./net"
import { t } from "./i18n"
import { useApp } from "./store"
import { clientId } from "./plex"
import { firstReachable } from "./plex-pure"
import { authHeader, imageUrl, jfActiveKind, jfCands, jfUrl, jfWatch, mapChannel, mapDetail, mapEpisode, mapItem, mapIntroSkipper, mapSegments, mapStreams, normServer, toTicks, type Img } from "./jellyfin-pure"

export { normServer }
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export type JfAuth = { token: string; userId: string }

const proxy = () => useApp.getState().settings.proxy
/** Same persisted device id as Plex: one id per install is all either server needs. */
export const jfDeviceId = clientId
const hdr = (token?: string, json = false): Record<string, string> => ({
  Accept: "application/json",
  "X-Emby-Authorization": authHeader(jfDeviceId(), token),
  ...(json ? { "Content-Type": "application/json" } : {}),
})

const base = (s: Source) => normServer(s.server ?? "")
async function call<T>(server: string, path: string, init?: RequestInit, params?: Record<string, string | number | undefined>, token?: string, px_ = proxy()): Promise<T> {
  const r = await plexFetch(jfUrl(normServer(server), path, params, token), px_, init, 20000)
  return r.status === 204 ? (undefined as T) : r.json().catch(() => { throw new Error(t("errors.jellyfin.notServer")) }) // HTML from a router/login page
}
const get = <T,>(s: Source, px_: string, path: string, params?: Record<string, string | number | undefined>) =>
  call<T>(base(s), path, { headers: { Accept: "application/json" } }, params, s.token, px_)

/* ---------- sign in ---------- */
/** Public server info (no auth): name, id, version. Also a cheap "is this a Jellyfin server" check. */
export async function jellyfinServerInfo(server: string): Promise<{ name: string; id: string; version: string }> {
  const j = await call<J>(server, "/System/Info/Public", { headers: { Accept: "application/json" } }, {}, undefined)
  if (!j?.Id) throw new Error(t("errors.jellyfin.notServer"))
  return { name: String(j.ServerName || "Jellyfin"), id: String(j.Id), version: String(j.Version ?? "") }
}

/* ---------- local / remote address ---------- */
/** One address answers /System/Info/Public (2.5s local, 6s remote), is the SAME server, and still accepts the saved token. */
async function jfProbe(s: Source, c: { uri: string; kind: string }) {
  const h = { headers: { Accept: "application/json" } }
  const j = await (await plexFetch(jfUrl(c.uri, "/System/Info/Public"), proxy(), h, c.kind === "local" ? 2500 : 6000)).json().catch(() => { throw new Error(t("errors.jellyfin.notServer")) })
  if (!j?.Id || (s.serverId && j.Id !== s.serverId)) throw new Error(t("errors.jellyfin.notServer")) // another box on that address
  if (s.token && s.userId) {
    try { await plexFetch(jfUrl(c.uri, `/Users/${s.userId}`, {}, s.token), proxy(), h, 6000) } catch (e) {
      if (e instanceof HttpError && (e.status === 401 || e.status === 403)) throw Object.assign(new Error(t("source.conn.badToken", { host: c.uri.replace(/^https?:\/\//, "") })), { auth: true })
      /* other failures: the public call already worked, so let the load report them */
    }
  }
}

/** Make sure the source's address works. Order: saved one (unless `force`), then local -> remote as the connection mode allows; the winner is saved into `server`. Returns the source to use. */
export async function ensureJellyfinConnection(s: Source, force = false): Promise<Source> {
  const cands = jfCands(s)
  const cur = normServer(s.server ?? "")
  if (!cands.length) throw new Error(t("source.conn.noRoute", { name: s.name }))
  const save = (uri: string) => { if (uri !== cur) useApp.getState().updateSource(s.id, { server: uri }); return { ...s, server: uri } }
  if (cands.length === 1) return save(cands[0].uri) // nothing to choose between; the load reports real errors
  const now = cands.find((c) => c.uri === cur)
  if (now && !force) { try { await jfProbe(s, now); return s } catch { /* try the others */ } }
  const { cand, errs } = await firstReachable(cands, (c) => jfProbe(s, c))
  if (!cand) throw errs.find((e) => (e as { auth?: boolean })?.auth) ?? new Error(t("source.conn.noRoute", { name: s.name }))
  return save(cand.uri)
}

/** Does the saved address answer right now (same server, token still accepted)? Throws when it does not; `ensureJellyfinConnection` skips this for a single address. */
export const pingJellyfin = (s: Source) => jfProbe(s, { uri: base(s), kind: jfActiveKind(s) })

const auth = (j: J): JfAuth => ({ token: String(j.AccessToken), userId: String(j.User?.Id) })

export async function jellyfinSignIn(server: string, user: string, pw: string): Promise<JfAuth> {
  try {
    return auth(await call<J>(server, "/Users/AuthenticateByName", { method: "POST", headers: hdr(undefined, true), body: JSON.stringify({ Username: user, Pw: pw }) }))
  } catch (e) {
    if (e instanceof Error && /HTTP 401/.test(e.message)) throw new Error(t("errors.jellyfin.wrongLogin"))
    throw e
  }
}

/* Quick Connect: show `code`, the user approves it in another signed-in Jellyfin app, poll until true, then finish. */
export const quickConnectEnabled = (server: string) =>
  call<boolean>(server, "/QuickConnect/Enabled", { headers: hdr() }).then((v) => v === true).catch(() => false)

export async function quickConnectStart(server: string): Promise<{ secret: string; code: string }> {
  const go = (method: string) => call<J>(server, "/QuickConnect/Initiate", { method, headers: hdr() })
  const j = await go("POST").catch((e) => (e instanceof Error && /HTTP 40[45]/.test(e.message) ? go("GET") : Promise.reject(e))) // GET on 10.8
  return { secret: String(j.Secret), code: String(j.Code) }
}

/** True once the code was approved. */
export const quickConnectCheck = async (server: string, secret: string) =>
  !!(await call<J>(server, "/QuickConnect/Connect", { headers: hdr() }, { secret })).Authenticated

export const quickConnectFinish = async (server: string, secret: string): Promise<JfAuth> =>
  auth(await call<J>(server, "/Users/AuthenticateWithQuickConnect", { method: "POST", headers: hdr(undefined, true), body: JSON.stringify({ Secret: secret }) }))

/* ---------- catalog ---------- */
/** Image URL, routed via /p when an https page would load http. */
export function jellyfinImg(s: Source): Img {
  const b = base(s)
  return (id, type, w, tag) => {
    const u = imageUrl(b, id, type, w, tag)
    return mixed(u) ? px(u, proxy()) : u
  }
}

const FIELDS = "Genres,Overview,ProviderIds,DateCreated,ParentId,PrimaryImageAspectRatio"

export async function loadJellyfin(s: Source, px_: string, step: (m: string) => void): Promise<Item[]> {
  const img = jellyfinImg(s)
  const uid = s.userId!
  // ponytail: libraries with no CollectionType are "mixed"; music/books/playlists/boxsets are skipped (boxsets would duplicate movies)
  const views = ((await get<{ Items?: J[] }>(s, px_, `/Users/${uid}/Views`)).Items ?? []).filter((v) => !v.CollectionType || v.CollectionType === "movies" || v.CollectionType === "tvshows")
  const out: Item[] = []
  const seen = new Set<string>()
  for (const v of views) {
    step(t("errors.source.loadingItem", { name: v.Name }))
    for (let start = 0, total = 1; start < total; ) {
      const c = await get<{ Items?: J[]; TotalRecordCount?: number }>(s, px_, `/Users/${uid}/Items`, {
        ParentId: v.Id, Recursive: "true", IncludeItemTypes: "Movie,Series", Fields: FIELDS, EnableUserData: "true",
        SortBy: "SortName", StartIndex: start, Limit: 500,
      })
      const list = c.Items ?? []
      for (const m of list) if (!seen.has(m.Id)) { seen.add(m.Id); out.push(mapItem(m, { sourceId: s.id, group: String(v.Name), img })) }
      total = c.TotalRecordCount ?? list.length
      start += 500
      if (!list.length) break
      step(t("errors.source.loadingProgress", { name: v.Name, done: Math.min(start, total), total }))
    }
  }
  try {
    step(t("errors.source.loadingChannels"))
    const ch = await get<{ Items?: J[] }>(s, px_, "/LiveTv/Channels", { userId: uid, EnableImages: "true", SortBy: "SortName" })
    for (const c of ch.Items ?? []) out.push(mapChannel(c, s.id, img))
  } catch { /* no live TV on this server (or no access): movies and series only */ }
  return out
}

/** Watch history: the newest 500 played + 500 in-progress movies/episodes of the signed-in user. */
export async function jellyfinHistory(s: Source, px_: string): Promise<Watch[]> {
  const q = (Filters: string) => get<{ Items?: J[] }>(s, px_, `/Users/${s.userId}/Items`, {
    Recursive: "true", IncludeItemTypes: "Movie,Episode", Filters, SortBy: "DatePlayed", SortOrder: "Descending", Limit: 500, EnableUserData: "true", EnableImages: "false",
  })
  const lists = await Promise.all([q("IsPlayed"), q("IsResumable")])
  return lists.flatMap((l) => (l.Items ?? []).map((m) => jfWatch(m, s.id)).filter((w): w is Watch => !!w))
}

export async function jellyfinPrograms(s: Source, px_: string, channelId: string): Promise<J[]> {
  const now = Date.now()
  const r = await get<{ Items?: J[]; Programs?: J[] }>(s, px_, "/LiveTv/Programs", {
    userId: s.userId, channelIds: channelId,
    MinStartDate: new Date(now - 3 * 3600_000).toISOString(), MaxStartDate: new Date(now + 6 * 3600_000).toISOString(),
  })
  return r.Items ?? r.Programs ?? []
}

export async function jellyfinDetail(s: Source, px_: string, item: Item): Promise<{ info: Record<string, unknown>; meta: Partial<import("./meta/types").Meta>; episodes: Episode[] }> {
  const img = jellyfinImg(s)
  const [d, sim, eps] = await Promise.all([
    get<J>(s, px_, `/Users/${s.userId}/Items/${item.sid}`),
    get<{ Items?: J[] }>(s, px_, `/Items/${item.sid}/Similar`, { userId: s.userId, limit: 20 }).catch(() => ({}) as { Items?: J[] }), // optional
    item.kind === "series"
      ? get<{ Items?: J[] }>(s, px_, `/Shows/${item.sid}/Episodes`, { userId: s.userId, Fields: "Overview,MediaSources", EnableUserData: "true" })
      : Promise.resolve({} as { Items?: J[] }),
  ])
  const r = mapDetail(d, img)
  const similar = (sim.Items ?? []).map((x) => ({ title: String(x.Name), year: x.ProductionYear ? String(x.ProductionYear) : undefined }))
  const episodes = (eps.Items ?? []).map((e) => mapEpisode(e, item, s.id, img))
  episodes.sort((a, b) => a.season - b.season || a.num - b.num)
  return { info: r.info, meta: { ...r.meta, similar }, episodes }
}

/* ---------- playback ---------- */
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("")
/** Per-page-load id; each item gets its own play session (also used to stop its transcode). */
export const jfSessionId = hex(16)
export const jfPlaySession = (item: Item) => `${jfSessionId}${item.sid}`

/** HLS (h264/aac: plays on Chrome 94 / webOS). Direct URL; the Player wraps it with px/pxStream on mixed content. */
// ponytail: live uses the channel id as MediaSourceId (the server falls back to the channel's first source); tuners that
// need an opened live stream would need POST /Items/{id}/PlaybackInfo with AutoOpenLiveStream and its LiveStreamId.
export const jellyfinStreamUrl = (s: Source, item: Item, q: StreamQ = STREAM_QS[0], tr: { audio?: number; sub?: number } = {}) => {
  const codecs = q.kbps ? ["h264"] : VIDEO_CODECS // original: copy hevc/av1 untouched when this device decodes them
  const audio = q.kbps ? ["aac"] : AUDIO_CODECS // and ac3/eac3
  return jfUrl(base(s), `/Videos/${item.sid}/master.m3u8`, {
    MediaSourceId: item.sid, PlaySessionId: jfPlaySession(item), DeviceId: jfDeviceId(), VideoCodec: codecs.join(","), AudioCodec: audio.join(","),
    MaxStreamingBitrate: (q.kbps ?? 200000) * 1000, MaxHeight: q.height, TranscodingMaxAudioChannels: q.kbps ? 2 : 6,
    SegmentContainer: codecs.length > 1 || audio.includes("eac3") ? "mp4" : "ts", AudioStreamIndex: tr.audio, ...(tr.sub !== undefined && tr.sub >= 0 ? { SubtitleStreamIndex: tr.sub, SubtitleMethod: "Encode" } : {}), // ponytail: subtitles are burned in, so every pick re-transcodes
    BreakOnNonKeyFrames: "true", // hevc/av1/eac3 need fMP4 segments (hls.js rejects eac3 in TS)
  }, s.token)
}

// Fire-and-forget: reports must never break playback.
function send(s: Source, method: string, path: string, params: Record<string, string | number | undefined> = {}, body?: unknown) {
  plexFetch(jfUrl(base(s), path, params, s.token), proxy(), body === undefined ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 15000).catch(() => {})
}

/** start = POST /Sessions/Playing, progress = .../Progress, stopped = .../Stopped (call on pause too with paused=true). */
export function jellyfinReport(s: Source, item: Item, state: "start" | "progress" | "stopped", posSec: number, paused = false) {
  const path = state === "start" ? "/Sessions/Playing" : state === "progress" ? "/Sessions/Playing/Progress" : "/Sessions/Playing/Stopped"
  send(s, "POST", path, {}, { ItemId: item.sid, MediaSourceId: item.sid, PositionTicks: toTicks(posSec), IsPaused: paused, PlaySessionId: jfPlaySession(item), PlayMethod: "Transcode", CanSeek: true })
}

/** Mark as watched. */
export const jellyfinMarkPlayed = (s: Source, item: Item) => send(s, "POST", `/Users/${s.userId}/PlayedItems/${item.sid}`)

/** Mark as unwatched (also clears the resume position). */
export const jellyfinMarkUnplayed = (s: Source, item: Item) => send(s, "DELETE", `/Users/${s.userId}/PlayedItems/${item.sid}`)

/** Audio + subtitle streams to pick from. */
export const jellyfinTracks = async (s: Source, item: Item) => mapStreams(await get<J>(s, proxy(), `/Users/${s.userId}/Items/${item.sid}`))

/** Intro / recap / outro segments: the server's own, else the Intro Skipper plugin's intro. */
export async function jellyfinSegments(s: Source, item: Item) {
  const own = await get<J>(s, proxy(), `/MediaSegments/${item.sid}`).then(mapSegments, () => [])
  return own.length ? own : get<J>(s, proxy(), `/Episode/${item.sid}/IntroTimestamps/v1`).then(mapIntroSkipper, () => [])
}

/** WebVTT text of one subtitle stream (the server converts text subtitles on the fly; fetched, not linked, so no CORS setup on <video>). */
export const jellyfinSubtitle = async (s: Source, item: Item, index: number) =>
  (await plexFetch(jfUrl(base(s), `/Videos/${item.sid}/${item.sid}/Subtitles/${index}/0/Stream.vtt`, {}, s.token), proxy(), undefined, 20000)).text()

/** Tell the server to kill this item's transcode. */
export const jellyfinStopTranscode = (s: Source, item: Item) =>
  send(s, "DELETE", "/Videos/ActiveEncodings", { deviceId: jfDeviceId(), playSessionId: jfPlaySession(item) })

/** Browsers can't do Jellyfin's UDP discovery, so probe likely addresses (typed host, this page's host, localhost) for a Jellyfin server. */
export async function detectJellyfin(typed = "", onProgress?: (pct: number) => void): Promise<{ server: string; name: string }[]> {
  const raw = typed.trim().replace(/^https?:\/\//i, "").replace(/[/?#].*$/, "")
  const hosts = [...new Set([raw.replace(/:\d+$/, ""), location.hostname, "localhost", "jellyfin.local"].filter(Boolean))]
  const cands = new Set<string>()
  if (/^https?:\/\//i.test(typed.trim()) || /:\d+$/.test(raw)) cands.add(normServer(typed))
  for (const h of hosts) for (const u of [`http://${h}:8096`, `https://${h}:8920`, `http://${h}`, `https://${h}`]) cands.add(u)
  const found = await Promise.all([...cands].map(async (server) => {
    try {
      const r = await plexFetch(jfUrl(server, "/System/Info/Public"), proxy(), { headers: { Accept: "application/json" } }, 2500)
      const j = await r.json()
      return j?.Id ? { server, name: String(j.ServerName || "Jellyfin") } : null
    } catch { return null }
  }))
  const seen = new Set<string>() // same server answering on several URLs: keep the first
  const quick = found.filter((x): x is { server: string; name: string } => !!x).filter((x) => !seen.has(x.name) && !!seen.add(x.name))
  if (quick.length) return quick
  // nothing at the usual addresses: sweep the local network
  return scanLan(8096, async (base) => {
    const j = await (await fetchT(jfUrl(base, "/System/Info/Public"), 800, { headers: { Accept: "application/json" } })).json()
    return j?.Id ? String(j.ServerName || "Jellyfin") : null
  }, onProgress)
}
