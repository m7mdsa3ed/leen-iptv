// Pure helpers for Detail's extra facts (no '@/' imports, no DOM) so `node scripts/meta.check.ts` can run them.
import type { Meta, Person } from "./types"
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const s = (v: unknown) => (v == null || v === "" ? undefined : String(v))
const names = (a: unknown, n: number) => ((a ?? []) as J[]).map((x) => s(x.name)).filter((x): x is string => !!x).slice(0, n)
const CREW = ["Creator", "Director", "Writer", "Screenplay", "Story", "Executive Producer", "Producer", "Original Music Composer", "Director of Photography"]

/** What TMDB's title response says beyond the basics (same response as the rest of Meta: no extra request). `img` = image base url. */
export function tmdbExtras(d: J, tv: boolean, img: string): Partial<Meta> {
  const crew = new Map<string, Person>()
  const add = (c: J, job: string) => {
    const id = String(c.id), p = crew.get(id)
    if (p) { if (!p.role!.split(", ").includes(job)) p.role += `, ${job}` }
    else crew.set(id, { id, name: String(c.name), role: job, photo: c.profile_path ? `${img}/w185${c.profile_path}` : undefined })
  }
  for (const c of (d.created_by ?? []) as J[]) add(c, "Creator")
  for (const c of ((d.credits?.crew ?? []) as J[]).filter((x) => CREW.includes(x.job)).sort((a, b) => CREW.indexOf(a.job) - CREW.indexOf(b.job))) add(c, c.job)
  const orig = s(d.original_title ?? d.original_name)
  const langs = [d.original_language, ...((d.spoken_languages ?? []) as J[]).map((l) => l.iso_639_1)].filter((l) => l && l !== "xx")
  const n = d.next_episode_to_air
  return {
    tagline: s(d.tagline),
    original: orig && orig !== (d.title ?? d.name) ? orig : undefined,
    status: s(d.status),
    languages: [...new Set<string>(langs)].slice(0, 3),
    countries: tv ? ((d.origin_country ?? []) as string[]).slice(0, 3) : ((d.production_countries ?? []) as J[]).map((c) => String(c.iso_3166_1)).slice(0, 3),
    studios: names(tv ? d.networks : d.production_companies, 3),
    next: n?.air_date ? { air: String(n.air_date), s: Number(n.season_number) || 1, e: Number(n.episode_number) || 1 } : undefined,
    crew: [...crew.values()].slice(0, 12),
  }
}

/** Technical facts of one copy (source) of a title. size = bytes, added = epoch seconds. */
export type StreamFacts = { res?: string; video?: string; audio?: string; ch?: string; box?: string; size?: number; added?: number; langs?: string[] }

const res = (w: number, h: number) => (w >= 3200 || h >= 2000 ? "4K" : w >= 1800 || h >= 1000 ? "1080p" : w >= 1200 || h >= 700 ? "720p" : h ? `${h}p` : undefined)
const CODEC: Record<string, string> = { h264: "H.264", avc: "H.264", hevc: "HEVC", h265: "HEVC", av1: "AV1", vp9: "VP9", mpeg4: "MPEG-4", aac: "AAC", ac3: "AC3", eac3: "E-AC3", dts: "DTS", truehd: "TrueHD", mp3: "MP3", opus: "Opus", flac: "FLAC" }
const codec = (c: unknown) => (c ? CODEC[String(c).toLowerCase()] ?? String(c).toUpperCase() : undefined)
const chan = (n: number) => (n === 1 ? "1.0" : n === 2 ? "2.0" : n === 6 ? "5.1" : n === 8 ? "7.1" : n > 0 ? `${n}ch` : undefined)
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {}) // Xtream sends [] when ffprobe never ran
const num = (v: unknown) => Number(v) || undefined
const uniq = (a: unknown[]) => [...new Set(a.map((x) => s(x)).filter((x): x is string => !!x && x !== "und"))]

/** Xtream get_vod_info / get_series_info `info` (+ `added` / `container` copied from movie_data). A Plex / Jellyfin `info.stream` is already normalised. */
export function streamInfo(info: J): StreamFacts {
  if (info.stream) return info.stream as StreamFacts
  const v = obj(info.video), a = obj(info.audio)
  return { res: res(Number(v.width) || 0, Number(v.height) || 0), video: codec(v.codec_name), audio: codec(a.codec_name), ch: chan(Number(a.channels)), box: s(info.container)?.toUpperCase(), added: num(info.added ?? info.last_modified) }
}
export function plexStream(m: J): StreamFacts {
  const media = (m.Media ?? [])[0] ?? {}, part = (media.Part ?? [])[0] ?? {}
  return {
    res: res(Number(media.width) || 0, Number(media.height) || 0), video: codec(media.videoCodec), audio: codec(media.audioCodec), ch: chan(Number(media.audioChannels)), box: s(media.container)?.toUpperCase(),
    size: num(part.size), added: num(m.addedAt), langs: uniq(((part.Stream ?? []) as J[]).filter((x) => x.streamType === 2).map((x) => x.languageTag ?? x.languageCode)),
  }
}
export function jfStream(m: J): StreamFacts {
  const src = (m.MediaSources ?? [])[0] ?? {}, st = (src.MediaStreams ?? m.MediaStreams ?? []) as J[]
  const v = st.find((x) => x.Type === "Video") ?? {}, a = st.find((x) => x.Type === "Audio") ?? {}
  return {
    res: res(Number(v.Width) || 0, Number(v.Height) || 0), video: codec(v.Codec), audio: codec(a.Codec), ch: chan(Number(a.Channels)), box: s(src.Container)?.toUpperCase(),
    size: num(src.Size), added: m.DateCreated ? Math.round(Date.parse(m.DateCreated) / 1000) || undefined : undefined, langs: uniq(st.filter((x) => x.Type === "Audio").map((x) => x.Language)),
  }
}
