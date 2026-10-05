// Pure Jellyfin helpers (no '@/' imports, no DOM) so `node scripts/jellyfin.check.ts` can run them.
import type { Episode, Item, Watch } from "./types"
import { isLanHost } from "./plex-pure.ts"
import { hasStreamFacts, jfStream } from "./meta/facts-pure.ts"
import { day } from "./browse-pure.ts"

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** (item id, image type, max width, tag) -> image URL. */
export type Img = (id: string, type: "Primary" | "Backdrop", w: number, tag?: string) => string

/** "jf.lan:8096/" -> "http://jf.lan:8096" (scheme added when missing, trailing slashes dropped). */
export const normServer = (s: string) => {
  const t = s.trim().replace(/\/+$/, "")
  return /^https?:\/\//i.test(t) ? t : `http://${t}`
}

/** base + path + query (values URL-encoded); the token goes last as api_key so GETs stay CORS-simple. */
export function jfUrl(base: string, path: string, params: Record<string, string | number | undefined> = {}, token?: string) {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  if (token) q.push(`api_key=${encodeURIComponent(token)}`)
  return base.replace(/\/+$/, "") + path + (q.length ? "?" + q.join("&") : "")
}

/** Value of the Authorization header (sign-in needs the client/device fields; the token is optional). */
export const authHeader = (deviceId: string, token?: string, device = "Web") =>
  `MediaBrowser Client="Leen TV", Device="${device}", DeviceId="${deviceId}", Version="1.0"` + (token ? `, Token="${token}"` : "")

export const toTicks = (sec: number) => Math.round(sec * 1e7)
export const fromTicks = (t: unknown) => (typeof t === "number" && t > 0 ? Math.round(t / 1e7) : undefined)

/** Image URL (Jellyfin serves images without auth, so no token ends up in cached items). */
export const imageUrl = (base: string, id: string, type: string, w: number, tag?: string) =>
  jfUrl(base, `/Items/${id}/Images/${type}`, { maxWidth: w, quality: 90, tag })

const poster = (m: J, img: Img, w: number) => (m.ImageTags?.Primary ? img(m.Id, "Primary", w, m.ImageTags.Primary) : undefined)
const backdrop = (m: J, img: Img) =>
  m.BackdropImageTags?.[0] ? img(m.Id, "Backdrop", 1280, m.BackdropImageTags[0])
  : m.ParentBackdropImageTags?.[0] && m.ParentBackdropItemId ? img(m.ParentBackdropItemId, "Backdrop", 1280, m.ParentBackdropImageTags[0]) : undefined

/** One Movie/Series from /Users/{uid}/Items -> catalog Item. `group` = library (view) name. */
export function mapItem(m: J, o: { sourceId: string; group: string; img: Img }): Item {
  const kind = m.Type === "Series" ? "series" : "movie"
  return {
    id: `${o.sourceId}|${kind}|${m.Id}`,
    kind,
    sid: String(m.Id),
    name: String(m.Name ?? "?"),
    group: o.group,
    logo: poster(m, o.img, 300),
    backdrop: backdrop(m, o.img),
    plot: m.Overview || undefined,
    rating: m.CommunityRating ? Number(m.CommunityRating).toFixed(1) : undefined,
    year: m.ProductionYear ? String(m.ProductionYear) : undefined,
    released: day(m.PremiereDate),
    added: Math.floor(Date.parse(m.DateCreated) / 1000) || undefined,
    genres: Array.isArray(m.Genres) ? m.Genres.map(String) : [],
    resume: fromTicks(m.UserData?.PlaybackPositionTicks),
    dur: fromTicks(m.RunTimeTicks),
    ext: m.Container ? String(m.Container).split(",")[0] : undefined,
  }
}

/** One Episode from /Shows/{id}/Episodes -> Episode (its item plays like a movie). */
export function mapEpisode(e: J, series: Item, sourceId: string, img: Img): Episode {
  const season = e.ParentIndexNumber != null ? Number(e.ParentIndexNumber) : 1 // 0 = specials
  const num = Number(e.IndexNumber) || 0
  const sec = fromTicks(e.RunTimeTicks)
  return {
    id: String(e.Id),
    season,
    num,
    title: String(e.Name ?? `Episode ${num}`),
    dur: sec || undefined,
    item: {
      id: `${sourceId}|ep|${e.Id}`,
      kind: "movie",
      sid: String(e.Id),
      name: `${series.name} S${season}E${num}`,
      group: series.name,
      series: series.id,
      logo: poster(e, img, 400) ?? series.logo,
      plot: e.Overview || undefined,
      resume: fromTicks(e.UserData?.PlaybackPositionTicks),
      dur: sec,
      ...(hasStreamFacts(jfStream(e)) ? { stream: jfStream(e) } : {}),
    },
  }
}

/** Jellyfin Movie/Episode with UserData -> Watch; undefined when never played. A resume position wins over Played (a rewatch in progress). */
export function jfWatch(m: J, sourceId: string): Watch | undefined {
  const u = m.UserData ?? {}, dur = fromTicks(m.RunTimeTicks) ?? 0
  const pos = fromTicks(u.PlaybackPositionTicks) ?? (u.Played ? dur : 0)
  if (!dur || !pos || (m.Type !== "Movie" && m.Type !== "Episode")) return undefined
  const ep = m.Type === "Episode"
  return { id: `${sourceId}|${ep ? "ep" : "movie"}|${m.Id}`, pos, dur, t: Date.parse(u.LastPlayedDate ?? "") || 0, ...(ep && m.SeriesId ? { series: `${sourceId}|series|${m.SeriesId}` } : {}) }
}

/** One /LiveTv/Channels entry -> live Item. */
export const mapChannel = (c: J, sourceId: string, img: Img): Item => ({
  id: `${sourceId}|live|${c.Id}`,
  kind: "live",
  sid: String(c.Id),
  name: String(c.Name ?? "?"),
  group: "Live TV",
  logo: poster(c, img, 300),
  epgId: String(c.Id),
  num: c.ChannelNumber && !isNaN(Number(c.ChannelNumber)) ? Number(c.ChannelNumber) : undefined,
})

/** GET /Users/{uid}/Items/{id} -> Xtream-like `info` + normalized meta fields (same shape as plex mapDetail). */
export function mapDetail(m: J, img: Img) {
  const genres: string[] = Array.isArray(m.Genres) ? m.Genres.map(String) : []
  const people = (m.People ?? []) as J[]
  const cast = people.filter((p) => p.Type === "Actor" || p.Type === "GuestStar").map((p) => ({
    name: String(p.Name), role: p.Role ? String(p.Role) : undefined, photo: p.PrimaryImageTag ? img(p.Id, "Primary", 200, p.PrimaryImageTag) : undefined,
  }))
  const directors = people.filter((p) => p.Type === "Director").map((p) => String(p.Name))
  const ratings = [
    ...(m.CommunityRating ? [{ source: "Rating", value: Number(m.CommunityRating).toFixed(1) }] : []),
    ...(m.CriticRating != null ? [{ source: "Rotten Tomatoes", value: `${m.CriticRating}%` }] : []),
  ]
  const sec = fromTicks(m.RunTimeTicks) ?? 0
  const year = m.ProductionYear ? String(m.ProductionYear) : undefined
  const ids = { tmdb: m.ProviderIds?.Tmdb || undefined, imdb: m.ProviderIds?.Imdb || undefined }
  return {
    info: {
      plot: m.Overview ?? "",
      genre: genres.join(", "),
      cast: cast.map((c) => c.name).join(", "),
      releasedate: (m.PremiereDate ? String(m.PremiereDate).slice(0, 10) : "") || year || "",
      duration: "",
      rating: m.CommunityRating ?? "",
      stream: jfStream(m),
    } as Record<string, unknown>,
    meta: { plot: m.Overview || undefined, genres, runtime: sec || undefined, year, ratings, poster: poster(m, img, 600), backdrop: backdrop(m, img), cast, directors, ids },
  }
}

/** WebVTT cue times moved by `sec` (negative = earlier; clamped at 0). Only timing lines (`-->`) are touched. */
export const shiftVtt = (txt: string, sec: number) => {
  if (!sec) return txt
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return txt.split("\n").map((l) => (!l.includes("-->") ? l : l.replace(/(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/g, (_, h, m, s, ms) => {
    const t = Math.max(0, ((+(h || 0)) * 3600 + +m * 60 + +s) * 1000 + +ms + Math.round(sec * 1000))
    return `${p(Math.floor(t / 3600000))}:${p(Math.floor(t / 60000) % 60)}:${p(Math.floor(t / 1000) % 60)}.${p(t % 1000, 3)}`
  }))).join("\n")
}

/** Audio / subtitle streams (MediaStreams of the item); ids are the stream Index the server expects back. */
export type SrvTrack = { id: number; label: string; def?: boolean; lang?: string; text?: boolean; detail?: string; flags?: string[] }
/** Skippable stretch of an episode, in seconds. */
export type Seg = { kind: "intro" | "recap" | "credits"; start: number; end: number }
const SEG_KIND: Record<string, Seg["kind"]> = { Intro: "intro", Recap: "recap", Outro: "credits" }
/** Jellyfin 10.10+ GET /MediaSegments/{id}: Items with Type + StartTicks/EndTicks. */
export const mapSegments = (j: J): Seg[] =>
  ((j?.Items ?? []) as J[]).filter((x) => SEG_KIND[x.Type] && x.EndTicks > x.StartTicks).map((x) => ({ kind: SEG_KIND[x.Type], start: x.StartTicks / 1e7, end: x.EndTicks / 1e7 }))
/** Intro Skipper plugin (older servers): GET /Episode/{id}/IntroTimestamps/v1 -> {Valid, IntroStart, IntroEnd} in seconds. */
export const mapIntroSkipper = (j: J): Seg[] => (j?.Valid && j.IntroEnd > j.IntroStart ? [{ kind: "intro", start: j.IntroStart, end: j.IntroEnd }] : [])

export function mapStreams(m: J): { audio: SrvTrack[]; subs: SrvTrack[] } {
  const st: J[] = m?.MediaSources?.[0]?.MediaStreams ?? m?.MediaStreams ?? []
  const pick = (type: string) => st.filter((s) => s.Type === type).map((s) => {
    const label = String(s.DisplayTitle || s.Language || s.Codec || s.Index)
    const extra = [s.Language, s.Codec ? String(s.Codec).toUpperCase() : "", type === "Audio" && Number(s.Channels) > 0 ? `${s.Channels}ch` : ""]
      .filter((v): v is string => !!v && !label.toLowerCase().includes(v.toLowerCase()))
    const flags = [s.IsForced ? "forced" : "", s.IsHearingImpaired ? "sdh" : ""].filter(Boolean)
    return { id: Number(s.Index), label, def: !!s.IsDefault, lang: s.Language || undefined, ...(extra.length ? { detail: extra.join(" · ") } : {}), ...(flags.length ? { flags } : {}), text: type === "Subtitle" ? !!s.IsTextSubtitleStream : undefined }
  })
  return { audio: pick("Audio"), subs: pick("Subtitle") }
}

/* ---------- local / remote addresses ---------- */
export type JfCand = { uri: string; kind: "local" | "remote" }
type JfConn = { server?: string; localServer?: string; remoteServer?: string; connMode?: string }
/** Addresses to try, in order (auto: local first, then remote). The connection mode filters them unless `all`. A source with only `server` is one address, local or remote by its host. */
export function jfCands(s: JfConn, all = false): JfCand[] {
  const L = s.localServer?.trim() ? normServer(s.localServer) : "", R = s.remoteServer?.trim() ? normServer(s.remoteServer) : ""
  if (!L && !R) return s.server?.trim() ? [{ uri: normServer(s.server), kind: isLanHost(s.server) ? "local" : "remote" }] : []
  const m = all ? "auto" : s.connMode
  return [...(L && m !== "remote" ? [{ uri: L, kind: "local" as const }] : []), ...(R && m !== "local" ? [{ uri: R, kind: "remote" as const }] : [])]
}
/** Is the active `server` the local or the remote address? */
export const jfActiveKind = (s: JfConn): "local" | "remote" => jfCands(s, true).find((c) => c.uri === normServer(s.server ?? ""))?.kind ?? (isLanHost(s.server ?? "") ? "local" : "remote")
