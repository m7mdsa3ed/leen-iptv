// Jellyfin server as a source: username/password or Quick Connect sign-in, catalog (per library), live TV + guide when the
// server has it, detail, HLS URL, progress reporting. The token rides as api_key in the query so GETs stay CORS-simple.
import { AUDIO_CODECS, STREAM_QS, VIDEO_CODECS, type StreamQ } from "./quality"
import type { Episode, Item, Prog, Source } from "./types"
import { mixed, plexFetch, px } from "./net"
import { useApp } from "./store"
import { clientId } from "./plex"
import { authHeader, imageUrl, jfUrl, mapChannel, mapDetail, mapEpisode, mapItem, mapPrograms, normServer, toTicks, type Img } from "./jellyfin-pure"

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
  return r.status === 204 ? (undefined as T) : r.json().catch(() => { throw new Error("That address doesn't look like a Jellyfin server.") }) // HTML from a router/login page
}
const get = <T,>(s: Source, px_: string, path: string, params?: Record<string, string | number | undefined>) =>
  call<T>(base(s), path, { headers: { Accept: "application/json" } }, params, s.token, px_)

/* ---------- sign in ---------- */
/** Public server info (no auth): name, id, version. Also a cheap "is this a Jellyfin server" check. */
export async function jellyfinServerInfo(server: string): Promise<{ name: string; id: string; version: string }> {
  const j = await call<J>(server, "/System/Info/Public", { headers: { Accept: "application/json" } }, {}, undefined)
  if (!j?.Id) throw new Error("That address doesn't look like a Jellyfin server.")
  return { name: String(j.ServerName || "Jellyfin"), id: String(j.Id), version: String(j.Version ?? "") }
}

const auth = (j: J): JfAuth => ({ token: String(j.AccessToken), userId: String(j.User?.Id) })

export async function jellyfinSignIn(server: string, user: string, pw: string): Promise<JfAuth> {
  try {
    return auth(await call<J>(server, "/Users/AuthenticateByName", { method: "POST", headers: hdr(undefined, true), body: JSON.stringify({ Username: user, Pw: pw }) }))
  } catch (e) {
    if (e instanceof Error && /HTTP 401/.test(e.message)) throw new Error("Wrong username or password.")
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
    step(`Loading ${v.Name}`)
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
      step(`Loading ${v.Name} (${Math.min(start, total)}/${total})`)
    }
  }
  try {
    step("Loading channels")
    const ch = await get<{ Items?: J[] }>(s, px_, "/LiveTv/Channels", { userId: uid, EnableImages: "true", SortBy: "SortName" })
    for (const c of ch.Items ?? []) out.push(mapChannel(c, s.id, img))
  } catch { /* no live TV on this server (or no access): movies and series only */ }
  return out
}

/** Guide for the given channel ids between `from` and `to` (ms), in the app's EPG shape. Batched to keep URLs short. */
export async function jellyfinEpg(s: Source, px_: string, channelIds: string[], from: number, to: number): Promise<Map<string, Prog[]>> {
  const all: J[] = []
  for (let i = 0; i < channelIds.length; i += 50) {
    const r = await get<{ Items?: J[] }>(s, px_, "/LiveTv/Programs", {
      UserId: s.userId, ChannelIds: channelIds.slice(i, i + 50).join(","), MinEndDate: new Date(from).toISOString(), MaxStartDate: new Date(to).toISOString(),
      EnableImages: "false", EnableUserData: "false", Fields: "Overview",
    })
    all.push(...(r.Items ?? []))
  }
  return mapPrograms(all)
}

export async function jellyfinDetail(s: Source, px_: string, item: Item): Promise<{ info: Record<string, unknown>; meta: Partial<import("./meta/types").Meta>; episodes: Episode[] }> {
  const img = jellyfinImg(s)
  const [d, sim, eps] = await Promise.all([
    get<J>(s, px_, `/Users/${s.userId}/Items/${item.sid}`),
    get<{ Items?: J[] }>(s, px_, `/Items/${item.sid}/Similar`, { userId: s.userId, limit: 20 }).catch(() => ({}) as { Items?: J[] }), // optional
    item.kind === "series"
      ? get<{ Items?: J[] }>(s, px_, `/Shows/${item.sid}/Episodes`, { userId: s.userId, Fields: "Overview", EnableUserData: "true" })
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
export const jellyfinStreamUrl = (s: Source, item: Item, q: StreamQ = STREAM_QS[0]) => {
  const codecs = q.kbps ? ["h264"] : VIDEO_CODECS // original: copy hevc/av1 untouched when this device decodes them
  const audio = q.kbps ? ["aac"] : AUDIO_CODECS // and ac3/eac3
  return jfUrl(base(s), `/Videos/${item.sid}/master.m3u8`, {
    MediaSourceId: item.sid, PlaySessionId: jfPlaySession(item), DeviceId: jfDeviceId(), VideoCodec: codecs.join(","), AudioCodec: audio.join(","),
    MaxStreamingBitrate: (q.kbps ?? 200000) * 1000, MaxHeight: q.height, TranscodingMaxAudioChannels: q.kbps ? 2 : 6,
    SegmentContainer: codecs.length > 1 || audio.includes("eac3") ? "mp4" : "ts", BreakOnNonKeyFrames: "true", // hevc/av1/eac3 need fMP4 segments (hls.js rejects eac3 in TS)
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

/** Tell the server to kill this item's transcode. */
export const jellyfinStopTranscode = (s: Source, item: Item) =>
  send(s, "DELETE", "/Videos/ActiveEncodings", { deviceId: jfDeviceId(), playSessionId: jfPlaySession(item) })
