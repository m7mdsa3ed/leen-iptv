// Pure Plex helpers (no '@/' imports, no DOM) so `node scripts/plex.check.ts` can run them.
import type { Item } from "./types"

export type Conn = { uri: string; local?: boolean; relay?: boolean; protocol?: string }
export type Ident = Record<string, string>
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const identity = (cid: string): Ident => ({
  "X-Plex-Product": "Leen",
  "X-Plex-Client-Identifier": cid,
  "X-Plex-Version": "1.0",
  "X-Plex-Platform": "Web",
  "X-Plex-Device": "Web",
  "X-Plex-Device-Name": "Leen",
})

/** base + path + query (values URL-encoded); the token goes last, in the query string, so GETs stay CORS-simple. */
export function buildUrl(base: string, path: string, params: Record<string, string | number> = {}, token?: string) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
  if (token) q.push(`X-Plex-Token=${encodeURIComponent(token)}`)
  return base.replace(/\/+$/, "") + path + (q.length ? "?" + q.join("&") : "")
}

export type ConnMode = "auto" | "norelay" | "local"
/** Which addresses a mode allows: local = LAN only (nothing leaves the network), norelay = LAN + direct remote, auto = all. */
export const allowedConns = (conns: Conn[], mode: ConnMode = "auto"): Conn[] =>
  conns.filter((c) => (mode === "local" ? !!c.local && !c.relay : mode === "norelay" ? !c.relay : true))
/** Human label of the address in use: Local / Remote / Relay (or Custom when it is not one of plex.tv's). */
export const connKind = (conns: Conn[] | undefined, uri: string | undefined): "Local" | "Remote" | "Relay" | "Custom" => {
  const c = conns?.find((x) => x.uri.replace(/\/+$/, "") === (uri ?? "").replace(/\/+$/, ""))
  return !c ? "Custom" : c.relay ? "Relay" : c.local ? "Local" : "Remote"
}

/** Connection test order: direct before relay, local first (TV/LAN), https before http. */
export function sortConns(conns: Conn[]): Conn[] {
  const rank = (c: Conn) => (c.relay ? 4 : 0) + (c.local ? 0 : 2) + (c.protocol === "https" || c.uri.startsWith("https:") ? 0 : 1)
  const seen = new Set<string>()
  return conns.filter((c) => c.uri && !seen.has(c.uri) && seen.add(c.uri)).sort((a, b) => rank(a) - rank(b))
}

export const photoUrl = (server: string, token: string, path: string, w: number, h: number) =>
  buildUrl(server, "/photo/:/transcode", { width: w, height: h, minSize: 1, upscale: 1, url: path }, token)

export const tagList = (v: unknown): string[] => (Array.isArray(v) ? (v as J[]).map((x) => String(x.tag ?? "")).filter(Boolean) : [])

/** One Plex Metadata entry -> catalog Item. `img` builds (and proxies) image URLs. */
export function mapMeta(m: J, o: { sourceId: string; group: string; img: (path: string, w: number, h: number) => string }): Item {
  const kind = m.type === "show" ? "series" : "movie"
  const rating = m.rating ?? m.audienceRating
  const resume = m.viewOffset ? Math.round(m.viewOffset / 1000) : undefined
  return {
    id: `${o.sourceId}|${kind}|${m.ratingKey}`,
    kind,
    sid: String(m.ratingKey),
    name: String(m.title ?? "?"),
    group: o.group,
    logo: m.thumb ? o.img(m.thumb, 300, 450) : undefined,
    backdrop: m.art ? o.img(m.art, 1280, 720) : undefined,
    plot: m.summary || undefined,
    rating: rating ? Number(rating).toFixed(1) : undefined,
    year: m.year ? String(m.year) : undefined,
    genres: tagList(m.Genre),
    resume,
    dur: m.duration ? Math.round(m.duration / 1000) : undefined,
    ext: m.Media?.[0]?.Part?.[0]?.container || m.Media?.[0]?.container || undefined,
  }
}

export const ratingSource = (image: string) =>
  image.startsWith("imdb:") ? "IMDb" : image.startsWith("rottentomatoes:") ? "Rotten Tomatoes" : image.startsWith("themoviedb:") ? "TMDB" : ""

/** GET /library/metadata/{key} entry -> Xtream-like `info` + normalized meta fields. */
export function mapDetail(m: J, img: (path: string, w: number, h: number) => string) {
  const genres = tagList(m.Genre)
  const cast = ((m.Role ?? []) as J[]).map((r) => ({ name: String(r.tag), role: r.role ? String(r.role) : undefined, photo: r.thumb ? img(r.thumb, 200, 200) : undefined }))
  const directors = tagList(m.Director)
  const ratings = ((m.Rating ?? []) as J[]).flatMap((r) => {
    const source = ratingSource(String(r.image ?? ""))
    return source && r.value != null ? [{ source, value: String(r.value) }] : []
  })
  const sec = m.duration ? Math.round(m.duration / 1000) : 0
  const year = m.year ? String(m.year) : undefined
  const runtime = sec || undefined
  return {
    info: {
      plot: m.summary ?? "",
      genre: genres.join(", "),
      cast: cast.map((c) => c.name).join(", "),
      releasedate: m.originallyAvailableAt || year || "",
      duration: "",
      rating: m.rating ?? m.audienceRating ?? "",
    } as Record<string, unknown>,
    meta: { plot: m.summary || undefined, genres, runtime, year, ratings, poster: m.thumb ? img(m.thumb, 600, 900) : undefined, backdrop: m.art ? img(m.art, 1280, 720) : undefined, cast, directors },
  }
}

/** Audio / subtitle streams of the first media part (GET /library/metadata/{id}); ids are Plex stream ids. */
export type SrvTrack = { id: number; label: string; def?: boolean; lang?: string; text?: boolean }
/** Subtitle codecs Plex can hand over as SRT (the rest, PGS / VOBSUB / DVB, are images and must be burned in). */
const TEXT_SUBS = ["srt", "subrip", "ass", "ssa", "webvtt", "vtt", "mov_text", "text"]

/** SRT -> WebVTT (a <track> only reads VTT). Already-VTT text passes through; anything else (ASS, empty) gives "". */
export function srtToVtt(txt: string): string {
  const t = txt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim()
  if (/^WEBVTT/.test(t)) return t + "\n"
  if (!t || !t.includes("-->")) return ""
  return "WEBVTT\n\n" + t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") + "\n"
}

export function mapStreams(m: J): { audio: SrvTrack[]; subs: SrvTrack[] } {
  const st: J[] = m?.Media?.[0]?.Part?.[0]?.Stream ?? []
  const pick = (type: number) => st.filter((s) => s.streamType === type).map((s) => ({ id: Number(s.id), label: String(s.displayTitle || s.extendedDisplayTitle || s.language || s.codec || s.id), def: !!(s.selected || s.default), lang: s.languageCode || undefined, ...(type === 3 ? { text: TEXT_SUBS.includes(String(s.codec).toLowerCase()) } : {}) }))
  return { audio: pick(2), subs: pick(3) }
}
