// Online subtitles (SubDL + OpenSubtitles): request builders, response mappers, zip reading, text decoding and format conversion.
// Pure (no fetch, no '@/' imports) so `node scripts/subs.check.ts` runs it.
import { srtToVtt } from "./plex-pure.ts"

/** Settings.subs: preferred languages (ISO 639-1, first = default) and the two provider keys. */
export type SubsCfg = { langs?: string[]; subdl?: string; os?: string; auto?: boolean } // auto: load the first language when a title starts
export type SubProvider = "subdl" | "opensubtitles"
/** What to look for: ids from metadata (TMDB / IMDb), else the title. Episodes: the SERIES ids + season/episode. */
export type SubQuery = { kind: "movie" | "series"; title: string; year?: string; tmdb?: string; imdb?: string; season?: number; episode?: number }
export type SubHit = { provider: SubProvider; ref: string; name: string; lang: string; hi?: boolean; downloads?: number }

/** Languages offered in the pickers (labels come from Intl.DisplayNames at render). */
export const SUB_LANGS = ["ar", "en", "fr", "es", "de", "it", "tr", "pt", "ru", "nl", "fa", "he", "hi", "id", "ja", "ko", "zh", "pl", "ro", "el", "sv"] as const
export const DEFAULT_SUB_LANGS = ["ar", "en"]

/** "Show S1E2" (every source names its episodes that way) -> season/episode. */
export function episodeOf(name: string): { season: number; episode: number } | null {
  const m = /\bS(\d{1,3})E(\d{1,4})\s*$/i.exec(name)
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null
}

const imdbNum = (s?: string) => (s && /^tt\d+$/.test(s) ? s.slice(2).replace(/^0+/, "") : undefined)

export function subdlSearchUrl(q: SubQuery, lang: string, key: string): string {
  const p = new URLSearchParams({ api_key: key, type: q.kind === "series" ? "tv" : "movie", languages: lang.toUpperCase(), subs_per_page: "30" })
  if (q.tmdb) p.set("tmdb_id", q.tmdb)
  else if (q.imdb) p.set("imdb_id", q.imdb)
  else { p.set("film_name", q.title); if (q.year) p.set("year", q.year) }
  if (q.season !== undefined) p.set("season_number", String(q.season))
  if (q.episode !== undefined) p.set("episode_number", String(q.episode))
  return `https://api.subdl.com/api/v1/subtitles?${p}`
}

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function mapSubdl(j: J, lang: string, q: SubQuery): SubHit[] {
  if (j?.status === false) throw new Error(String(j.error ?? "SubDL error"))
  return ((j?.subtitles ?? []) as J[])
    // season packs are fine (the right file is picked from the zip); other episodes are not
    .filter((s) => q.episode === undefined || s.episode == null || Number(s.episode) === q.episode || s.full_season || (s.episode_from != null && q.episode >= Number(s.episode_from) && q.episode <= Number(s.episode_end ?? s.episode_from)))
    .filter((s) => s.url)
    .map((s) => ({ provider: "subdl" as const, ref: String(s.url), name: String(s.release_name || s.name || "SubDL"), lang: String(s.language ?? lang).toLowerCase(), ...(s.hi ? { hi: true } : {}) }))
}
export const subdlFileUrl = (ref: string) => `https://dl.subdl.com${ref.startsWith("/") ? "" : "/"}${ref}`

/** OpenSubtitles wants its query sorted and lowercase (else it redirects, which breaks CORS). */
export function osSearchUrl(q: SubQuery, lang: string): string {
  const p: Record<string, string> = { languages: lang.toLowerCase() }
  const tmdb = q.tmdb, imdb = imdbNum(q.imdb)
  if (q.kind === "series") {
    if (tmdb) p.parent_tmdb_id = tmdb
    else if (imdb) p.parent_imdb_id = imdb
    else p.query = q.title.toLowerCase()
    if (q.season !== undefined) p.season_number = String(q.season)
    if (q.episode !== undefined) p.episode_number = String(q.episode)
    p.type = "episode"
  } else {
    if (tmdb) p.tmdb_id = tmdb
    else if (imdb) p.imdb_id = imdb
    else { p.query = q.title.toLowerCase(); if (q.year) p.year = q.year }
    p.type = "movie"
  }
  const qs = Object.keys(p).sort().map((k) => `${k}=${encodeURIComponent(p[k]).replace(/%20/g, "+")}`).join("&")
  return `https://api.opensubtitles.com/api/v1/subtitles?${qs}`
}

export function mapOs(j: J): SubHit[] {
  return ((j?.data ?? []) as J[]).flatMap((d) => {
    const a = d.attributes ?? {}, f = (a.files ?? [])[0]
    if (!f?.file_id) return []
    return [{ provider: "opensubtitles" as const, ref: String(f.file_id), name: String(a.release || f.file_name || "OpenSubtitles"), lang: String(a.language ?? "").toLowerCase(), downloads: Number(a.download_count) || 0, ...(a.hearing_impaired ? { hi: true } : {}) }]
  })
}

/** Both lists merged: OpenSubtitles by downloads, SubDL after it interleaved, no duplicate release names. */
export function mergeHits(lists: SubHit[][]): SubHit[] {
  const seen = new Set<string>(), out: SubHit[] = []
  const sorted = lists.map((l) => l.slice().sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0)))
  for (let i = 0; sorted.some((l) => i < l.length); i++)
    for (const l of sorted) {
      const h = l[i]
      const k = h && `${h.lang}|${h.name.toLowerCase()}`
      if (h && !seen.has(k)) { seen.add(k); out.push(h) }
    }
  return out
}

/* ---------- zip ---------- */
export type ZipEntry = { name: string; method: number; crc: number; size: number; data: Uint8Array }
const u16 = (b: Uint8Array, p: number) => b[p] | (b[p + 1] << 8)
const u32 = (b: Uint8Array, p: number) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0

/** Central directory -> entries with their (still compressed) data. [] when not a zip. */
export function readZip(b: Uint8Array): ZipEntry[] {
  let e = -1
  for (let p = b.length - 22; p >= Math.max(0, b.length - 65557); p--) if (u32(b, p) === 0x06054b50) { e = p; break }
  if (e < 0) return []
  const n = u16(b, e + 10)
  let p = u32(b, e + 16)
  const out: ZipEntry[] = []
  for (let i = 0; i < n && u32(b, p) === 0x02014b50; i++) {
    const method = u16(b, p + 10), crc = u32(b, p + 16), csize = u32(b, p + 20), size = u32(b, p + 24)
    const nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), local = u32(b, p + 42)
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl))
    if (u32(b, local) === 0x04034b50) {
      const at = local + 30 + u16(b, local + 26) + u16(b, local + 28)
      out.push({ name, method, crc, size, data: b.subarray(at, at + csize) })
    }
    p += 46 + nl + xl + cl
  }
  return out
}

/** Raw deflate wrapped as gzip (crc + size come from the zip): DecompressionStream("gzip") exists on Chrome 80+, "deflate-raw" only on 103+. */
export function gzipWrap(e: ZipEntry): Uint8Array {
  const out = new Uint8Array(10 + e.data.length + 8)
  out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 0xff])
  out.set(e.data, 10)
  const t = 10 + e.data.length
  for (let i = 0; i < 4; i++) { out[t + i] = (e.crc >>> (8 * i)) & 0xff; out[t + 4 + i] = (e.size >>> (8 * i)) & 0xff }
  return out
}

const SUB_EXT = /\.(srt|vtt|ass|ssa)$/i
/** The subtitle file to use from a zip: the episode's in a season pack, else the first .srt, else any subtitle file. */
export function pickEntry(entries: ZipEntry[], ep?: { season: number; episode: number }): ZipEntry | undefined {
  const subs = entries.filter((x) => SUB_EXT.test(x.name) && !x.name.startsWith("__MACOSX"))
  if (ep && subs.length > 1) {
    const re = new RegExp(`(?:s0*${ep.season}[ ._-]*e0*${ep.episode}(?!\\d))|(?:\\b${ep.season}x0*${ep.episode}(?!\\d))|(?:\\be0*${ep.episode}(?!\\d))`, "i")
    const hit = subs.find((x) => re.test(x.name))
    if (hit) return hit
  }
  return subs.find((x) => /\.srt$/i.test(x.name)) ?? subs[0]
}

/* ---------- text ---------- */
const LEGACY: Record<string, string> = { ar: "windows-1256", fa: "windows-1256", ur: "windows-1256", ru: "windows-1251", uk: "windows-1251", bg: "windows-1251", sr: "windows-1251", el: "windows-1253", tr: "windows-1254", he: "windows-1255" }
/** Bytes -> text: BOM, then strict UTF-8, then the usual legacy code page of the language (old Arabic SRTs are Windows-1256). */
export function decodeSub(b: Uint8Array, lang: string): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2))
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2))
  try { return new TextDecoder("utf-8", { fatal: true }).decode(b) } catch { /* not UTF-8 */ }
  try { return new TextDecoder(LEGACY[lang] ?? "windows-1252").decode(b) } catch { return new TextDecoder().decode(b) }
}

const assTime = (t: string) => { const m = /(\d+):(\d+):(\d+)[.:](\d+)/.exec(t); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 10 ** m[4].length : NaN }
const vttTime = (s: number) => {
  const ms = Math.round(s * 1000), p = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`
}
/** ASS/SSA script -> WebVTT (Dialogue lines only; override tags dropped). */
export function assToVtt(txt: string): string {
  const cues = txt.split(/\r?\n/).flatMap((l) => {
    const m = /^Dialogue:\s*[^,]*,([^,]*),([^,]*),(?:[^,]*,){6}(.*)$/.exec(l)
    if (!m) return []
    const a = assTime(m[1]), b = assTime(m[2])
    const text = m[3].replace(/\{[^}]*\}/g, "").replace(/\\N/gi, "\n").replace(/\\h/g, " ").replace(/-->/g, "->").trim()
    return Number.isFinite(a) && Number.isFinite(b) && text ? [{ a, b, text }] : []
  }).sort((x, y) => x.a - y.a)
  return "WEBVTT\n\n" + cues.map((c) => `${vttTime(c.a)} --> ${vttTime(c.b)}\n${c.text}\n`).join("\n")
}

/** Any downloaded subtitle file -> WebVTT ("" when it is not one). SRT also tolerates dot milliseconds and 1-digit hours. */
export function toWebVtt(name: string, text: string): string {
  const t = text.replace(/^﻿/, "")
  if (/\.(ass|ssa)$/i.test(name) || /^\s*\[Script Info\]/i.test(t)) return assToVtt(t)
  if (/^\s*WEBVTT/.test(t)) return t.trim() + "\n"
  const fixed = t.replace(/(^|[^\d:])(\d):(\d{2}:\d{2}[,.]\d{3})/g, "$10$2:$3").replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, "$1,$2")
  return srtToVtt(fixed)
}

/* ---------- rendering ---------- */
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "‎", rlm: "‏", quot: '"', apos: "'" }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
/** Cue text -> safe HTML: only <i>, <b>, <u> survive (VTT voice/class/timestamp tags, SRT <font> and anything else are dropped). */
export function cueHtml(text: string): string {
  const t = text.replace(/&(amp|lt|gt|nbsp|lrm|rlm|quot|apos);/g, (_, e: string) => ENT[e])
  return t.split(/(<\/?[a-z][^>]*>)/gi).map((part) => {
    const m = /^<(\/?)([a-z]+)[^>]*>$/i.exec(part)
    if (!m) return esc(part)
    const tag = m[2].toLowerCase()
    return tag === "i" || tag === "b" || tag === "u" ? `<${m[1]}${tag}>` : ""
  }).join("")
}


/* ---------- languages ---------- */
// Plex / Jellyfin tag tracks with ISO 639-2 (both B and T forms appear); the pickers use ISO 639-1
const ISO3: Record<string, string[]> = {
  ar: ["ara"], en: ["eng"], fr: ["fre", "fra"], es: ["spa"], de: ["ger", "deu"], it: ["ita"], tr: ["tur"], pt: ["por"], ru: ["rus"], nl: ["dut", "nld"],
  fa: ["per", "fas"], he: ["heb"], hi: ["hin"], id: ["ind"], ja: ["jpn"], ko: ["kor"], zh: ["chi", "zho"], pl: ["pol"], ro: ["rum", "ron"], el: ["gre", "ell"], sv: ["swe"],
}
/** Does a track's language tag (en, eng, en-US, pt-BR...) mean the ISO 639-1 `code`? */
export function sameLang(code: string, tag?: string): boolean {
  const x = (tag ?? "").toLowerCase()
  return !!x && (x === code || x.startsWith(`${code}-`) || (ISO3[code] ?? []).includes(x))
}

/* ---------- text clean-up (applied when drawing) ---------- */
const RTL = /[\u0590-\u08ff\ufb1d-\ufefc]/
const LEAD_PUNCT = /^((?:<[^>]+>)*)([.,!?:;\u060c\u061b\u061f\u2026]+)\s*(.*)$/s
/** Hearing-impaired removal ([sound], (sound), ♪ lyrics ♪, "NAME:" labels) and the RTL punctuation fix for files saved for
    old left-to-right renderers (".مرحبا" -> "مرحبا."). Returns "" when nothing is left to show. */
export function cleanCue(text: string, o: { noHi?: boolean; rtlFix?: boolean }): string {
  let t = text
  if (o.noHi) {
    t = t.replace(/\[[^\]]*\]|\([^)]*\)|\uff08[^\uff09]*\uff09|[\u266a\u266b#][^\u266a\u266b#\n]*[\u266a\u266b#]?/g, "")
    t = t.split("\n").map((l) => l.replace(/^(\s*(?:<[^>]+>)*\s*-?\s*)[A-Z][A-Z0-9 .'&-]{1,30}:\s*/, "$1").trim()).filter((l) => l.replace(/<[^>]+>|[-\s]/g, "")).join("\n")
  }
  if (o.rtlFix) t = t.split("\n").map((l) => (RTL.test(l) ? l.replace(LEAD_PUNCT, "$1$3$2") : l)).join("\n")
  return t.trim()
}
