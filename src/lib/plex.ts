// Plex Media Server as a source: plex.tv PIN sign-in, server discovery, catalog, detail, HLS URL, progress sync.
// All identity values and the token ride in the query string and requests only send Accept, so GETs stay CORS-simple.
// No EPG / live TV for Plex in this version.
import { AUDIO_CODECS, STREAM_QS, VIDEO_CODECS, type StreamQ } from "./quality"
import type { Episode, Item, Source } from "./types"
import { mixed, plexFetch, px } from "./net"
import { t } from "./i18n"
import { useApp } from "./store"
import { allowedConns, buildUrl, connKind, identity, mapDetail, mapMeta, photoUrl, sortConns, type Conn, type ConnMode } from "./plex-pure"

export { sortConns }
export type PlexServer = { name: string; id: string; token: string; owned: boolean; connections: Conn[] }

const JSON_H = { Accept: "application/json" }
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("")
const proxy = () => useApp.getState().settings.proxy

export function clientId(): string {
  try {
    let v = localStorage.getItem("iptv-plex-cid")
    if (!v) localStorage.setItem("iptv-plex-cid", (v = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`)) // randomUUID needs a secure context
    return v
  } catch {
    return hex(32)
  }
}

/** Per-page-load session id used for timeline reports; transcodes get one per item (plexTranscodeId). */
export const plexSessionId = hex(16)
const plexTranscodeId = (item: Item) => `${plexSessionId}-${item.sid}`

/** `base + path` with the identity params, extra params and the token (all in the query string). */
export const plexUrl = (base: string, path: string, params: Record<string, string | number> = {}, token?: string) =>
  buildUrl(base, path, { ...identity(clientId()), ...params }, token)

/* ---------- sign in ---------- */
export type Pin = { id: number; code: string; expiresIn: number; strong: boolean }

/** strong=true: a long code for the QR / app.plex.tv/auth flow (no typing); strong=false: the short code typed at plex.tv/link. */
export async function createPin(strong = true): Promise<Pin> {
  const r = await plexFetch(plexUrl("https://plex.tv", "/api/v2/pins", { strong: String(strong) }), proxy(), { method: "POST", headers: JSON_H }, 15000)
  const j = await r.json()
  return { id: j.id, code: j.code, expiresIn: j.expiresIn ?? 900, strong }
}

/** Page that approves a strong pin: open it (or scan its QR) on any device, sign in to Plex and approve Leen. */
export const plexAuthUrl = (code: string) =>
  `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId())}&code=${encodeURIComponent(code)}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent("Leen")}`

/** The account token once the user entered the code at plex.tv/link, else null. An expired pin throws. */
export async function checkPin(id: number): Promise<string | null> {
  try {
    const r = await plexFetch(plexUrl("https://plex.tv", `/api/v2/pins/${id}`), proxy(), { headers: JSON_H }, 15000)
    return (await r.json()).authToken || null
  } catch (e) {
    if (e instanceof Error && e.message === "HTTP 404") throw new Error(t("errors.plex.codeExpired"))
    throw e
  }
}

/** Servers on the account (owned or shared), each with its own access token. */
export async function plexServers(token: string): Promise<PlexServer[]> {
  const url = plexUrl("https://clients.plex.tv", "/api/v2/resources", { includeHttps: 1, includeRelay: 1, includeIPv6: 1 }, token)
  const list = await (await plexFetch(url, proxy(), { headers: JSON_H }, 20000)).json()
  return (Array.isArray(list) ? list : [])
    .filter((r) => String(r.provides ?? "").split(",").includes("server"))
    .map((r) => ({ name: String(r.name), id: String(r.clientIdentifier), token: String(r.accessToken || token), owned: !!r.owned, connections: (r.connections ?? []) as Conn[] }))
}

const reach = async (uri: string, token: string, ms = 5000) => {
  await plexFetch(plexUrl(uri, "/identity", {}, token), proxy(), { headers: JSON_H }, ms)
  return uri.replace(/\/+$/, "")
}
const noRoute = (name: string, mode: ConnMode) => t(mode === "local" ? "errors.plex.noRouteLocal" : mode === "norelay" ? "errors.plex.noRouteNoRelay" : "errors.plex.noRouteAny", { name })

/** First reachable address the mode allows, in priority order (GET /identity, 5s each). */
export async function pickConnection(s: PlexServer, mode: ConnMode = "auto"): Promise<string> {
  for (const c of sortConns(allowedConns(s.connections, mode))) {
    try { return await reach(c.uri, s.token) } catch { /* next */ }
  }
  throw new Error(noRoute(s.name, mode))
}

/** Make sure the source's address works: saved one first, then the other addresses the mode allows; the winner is saved. Returns the source to use. */
export async function ensureConnection(s: Source, force = false): Promise<Source> {
  const mode = s.connMode ?? "auto"
  const conns = s.conns ?? []
  const cur = (s.server ?? "").replace(/\/+$/, "")
  const allowedNow = !conns.length || allowedConns(conns, mode).some((c) => c.uri.replace(/\/+$/, "") === cur)
  if (allowedNow && !force) { try { await reach(cur, s.token ?? "", 4000); return s } catch { if (!conns.length) return s /* manual source: nothing else to try */ } }
  if (!conns.length) return s
  for (const c of sortConns(allowedConns(conns, mode))) {
    try {
      const uri = await reach(c.uri, s.token ?? "")
      if (uri !== cur) useApp.getState().updateSource(s.id, { server: uri })
      return { ...s, server: uri }
    } catch { /* next */ }
  }
  throw new Error(noRoute(s.name, mode))
}

/** Settings > Sources "Re-test connection": pick again from scratch under the current mode. */
export async function retestPlex(s: Source): Promise<"Local" | "Remote" | "Relay" | "Custom"> {
  const r = await ensureConnection(s, true)
  return connKind(s.conns, r.server)
}

/* ---------- requests against the chosen server ---------- */
const base = (s: Source) => s.server!.replace(/\/+$/, "")
const sUrl = (s: Source, path: string, params: Record<string, string | number> = {}) => plexUrl(base(s), path, params, s.token)

async function get<T>(s: Source, px_: string, path: string, params?: Record<string, string | number>): Promise<T> {
  return (await plexFetch(sUrl(s, path, params), px_, { headers: JSON_H })).json()
}

/** Poster/art/photo through the server's transcoder; routed via /p when an https page would load http. */
export function plexImg(s: Source, path: string, w: number, h: number): string {
  const u = photoUrl(base(s), s.token ?? "", path, w, h)
  return mixed(u) ? px(u, proxy()) : u
}

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Container = { MediaContainer?: { totalSize?: number; size?: number; Directory?: J[]; Metadata?: J[] } }

export async function loadPlex(src: Source, px_: string, step: (m: string) => void): Promise<Item[]> {
  const s = await ensureConnection(src) // home -> away (or back): move to whichever allowed address answers
  const secs = ((await get<Container>(s, px_, "/library/sections")).MediaContainer?.Directory ?? []).filter((d) => d.type === "movie" || d.type === "show")
  const out: Item[] = []
  const img = (p: string, w: number, h: number) => plexImg(s, p, w, h)
  for (const d of secs) {
    step(t("errors.source.loadingItem", { name: d.title }))
    for (let start = 0, total = 1; start < total; ) {
      const c = (await get<Container>(s, px_, `/library/sections/${d.key}/all`, { includeGuids: 1, "X-Plex-Container-Start": start, "X-Plex-Container-Size": 500 })).MediaContainer
      const list = c?.Metadata ?? []
      for (const m of list) out.push(mapMeta(m, { sourceId: s.id, group: String(d.title), img }))
      total = c?.totalSize ?? list.length
      start += 500
      if (!list.length) break
      step(t("errors.source.loadingProgress", { name: d.title, done: Math.min(start, total), total }))
    }
  }
  return out
}

export async function plexDetail(s: Source, px_: string, item: Item): Promise<{ info: Record<string, unknown>; meta: Partial<import("./meta/types").Meta>; episodes: Episode[] }> {
  const img = (p: string, w: number, h: number) => plexImg(s, p, w, h)
  const key = item.sid!
  const [d, sim, leaves] = await Promise.all([
    get<Container>(s, px_, `/library/metadata/${key}`),
    get<Container>(s, px_, `/library/metadata/${key}/similar`).catch(() => ({}) as Container), // optional
    item.kind === "series" ? get<Container>(s, px_, `/library/metadata/${key}/allLeaves`) : Promise.resolve({} as Container),
  ])
  const m = d.MediaContainer?.Metadata?.[0] ?? {}
  const r = mapDetail(m, img)
  const similar = (sim.MediaContainer?.Metadata ?? []).map((x) => ({ title: String(x.title), year: x.year ? String(x.year) : undefined }))
  const episodes: Episode[] = (leaves.MediaContainer?.Metadata ?? []).map((e) => {
    const season = Number(e.parentIndex) || 1
    const num = Number(e.index) || 0
    return {
      id: String(e.ratingKey),
      season,
      num,
      title: String(e.title ?? `Episode ${num}`),
      dur: e.duration ? Math.round(e.duration / 1000) : undefined,
      item: {
        id: `${s.id}|ep|${e.ratingKey}`,
        kind: "movie",
        sid: String(e.ratingKey),
        name: `${item.name} S${season}E${num}`,
        group: item.name,
        logo: e.thumb ? img(e.thumb, 400, 225) : item.logo,
        plot: e.summary || undefined,
        resume: e.viewOffset ? Math.round(e.viewOffset / 1000) : undefined,
        dur: e.duration ? Math.round(e.duration / 1000) : undefined,
      },
    }
  })
  episodes.sort((a, b) => a.season - b.season || a.num - b.num)
  return { info: r.info, meta: { ...r.meta, similar }, episodes }
}

/* ---------- playback ---------- */
/** HLS from the server's universal transcoder (direct URL; the Player wraps it with pxStream on mixed content). */
const profileExtra = (q: StreamQ) => q.kbps ? "" : [
  VIDEO_CODECS.includes("hevc") && "append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&videoCodec=hevc)",
  AUDIO_CODECS.includes("ac3") && "append-transcode-target-audio-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=ac3)",
].filter(Boolean).join("+")
export const plexStreamUrl = (s: Source, item: Item, q: StreamQ = STREAM_QS[0]) =>
  plexUrl(base(s), "/video/:/transcode/universal/start.m3u8", {
    path: `/library/metadata/${item.sid}`, mediaIndex: 0, partIndex: 0, protocol: "hls", offset: 0, fastSeek: 1, directPlay: 0, directStream: 1,
    subtitleSize: 100, audioBoost: 100, videoResolution: q.height ? `${Math.round(q.height * 16 / 9)}x${q.height}` : "3840x2160", maxVideoBitrate: q.kbps ?? 200000,
    "X-Plex-Platform": "Chrome", "X-Plex-Session-Identifier": plexSessionId, session: plexTranscodeId(item),
    // Original: let Plex copy hevc/ac3 as-is when this device decodes them. Plex HLS is TS-only and hls.js reads hevc and ac3 in TS but not av1/eac3.
    ...(profileExtra(q) ? { "X-Plex-Client-Profile-Extra": profileExtra(q) } : {}),
  }, s.token)

// Fire-and-forget: reports must never break playback.
function ping(s: Source, path: string, params: Record<string, string | number>) {
  const u = sUrl(s, path, params)
  const p = mixed(u) ? px(u, proxy()) : u
  fetch(p, p === u ? { mode: "no-cors" } : undefined).catch(() => {})
}

export function plexTimeline(s: Source, item: Item, state: "playing" | "paused" | "stopped", posSec: number, durSec: number) {
  ping(s, "/:/timeline", {
    ratingKey: item.sid!, key: `/library/metadata/${item.sid}`, state, time: Math.round(posSec * 1000), duration: Math.round(durSec * 1000),
    identifier: "com.plexapp.plugins.library", "X-Plex-Session-Identifier": plexSessionId,
  })
}

/** Tell the server to kill the transcode. */
export const plexStopTranscode = (s: Source, item: Item) => ping(s, "/video/:/transcode/universal/stop", { session: plexTranscodeId(item) })

/** Mark as watched. */
export const plexScrobble = (s: Source, item: Item) => ping(s, "/:/scrobble", { key: item.sid!, identifier: "com.plexapp.plugins.library" })
