// Pure Jellyfin helpers (no '@/' imports, no DOM) so `node scripts/jellyfin.check.ts` can run them.
import type { Episode, Item, Prog } from "./types"

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
      logo: poster(e, img, 400) ?? series.logo,
      plot: e.Overview || undefined,
      resume: fromTicks(e.UserData?.PlaybackPositionTicks),
      dur: sec,
    },
  }
}

/** One /LiveTv/Channels entry -> live Item; epgId = channel id so the guide lines up with jellyfin programs. */
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

/** /LiveTv/Programs entries -> the app's guide map (channel id -> programmes sorted by start, ms epoch). */
export function mapPrograms(list: J[]): Map<string, Prog[]> {
  const out = new Map<string, Prog[]>()
  for (const p of list) {
    const s = Date.parse(p.StartDate), e = Date.parse(p.EndDate)
    if (!p.ChannelId || isNaN(s) || isNaN(e)) continue
    const k = String(p.ChannelId)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push({ s, e, t: String(p.EpisodeTitle ? `${p.Name}: ${p.EpisodeTitle}` : p.Name ?? ""), d: p.Overview || undefined })
  }
  for (const l of out.values()) l.sort((a, b) => a.s - b.s)
  return out
}

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
export type SrvTrack = { id: number; label: string; def?: boolean; lang?: string; text?: boolean }
export function mapStreams(m: J): { audio: SrvTrack[]; subs: SrvTrack[] } {
  const st: J[] = m?.MediaSources?.[0]?.MediaStreams ?? m?.MediaStreams ?? []
  const pick = (type: string) => st.filter((s) => s.Type === type).map((s) => ({ id: Number(s.Index), label: String(s.DisplayTitle || s.Language || s.Codec || s.Index), def: !!s.IsDefault, lang: s.Language || undefined, text: type === "Subtitle" ? !!s.IsTextSubtitleStream : undefined }))
  return { audio: pick("Audio"), subs: pick("Subtitle") }
}
