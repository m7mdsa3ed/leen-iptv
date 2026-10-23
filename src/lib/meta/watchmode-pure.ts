// Pure mappers for the Watchmode API (https://api.watchmode.com/docs); no '@/' imports so `node scripts/watchmode.check.ts` can run them.
import type { Avail, AvailKind, Meta } from "./types.ts"

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {})
/** a non-empty string, or undefined for null / "" / "N/A" / 0 */
const str = (v: unknown): string | undefined => {
  const x = typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : ""
  return x && !/^(n\/a|null|undefined|0)$/i.test(x) ? x : undefined
}
const url = (v: unknown) => { const x = str(v); return x && /^https?:\/\//i.test(x) ? x : undefined }

/** The id Watchmode's title endpoints take for ids we already know: an IMDb id, else TMDB as `movie-<id>` / `tv-<id>` (a bare TMDB number is ambiguous between the two). */
export function watchmodeRef(kind: "movie" | "series", imdb?: string, tmdb?: string): string | undefined {
  const i = str(imdb), t = str(tmdb)
  if (i && /^tt\d+$/.test(i)) return i
  return t && /^\d+$/.test(t) ? `${kind === "series" ? "tv" : "movie"}-${t}` : undefined
}

/** GET /title/{id}/details/ -> the fields Meta has a place for. Missing / N/A fields are left out; never throws. */
export function mapWatchmodeDetails(j: unknown): Partial<Meta> {
  const d = obj(j)
  const ratings: Meta["ratings"] = []
  const user = Number(d.user_rating), critic = Number(d.critic_score)
  if (user > 0) ratings.push({ source: "Watchmode", value: user.toFixed(1) })
  if (critic > 0) ratings.push({ source: "Critics", value: `${Math.round(critic)}%` })
  const minutes = Number(d.runtime_minutes)
  const lang = str(d.original_language)?.toLowerCase()
  return {
    year: str(d.year)?.match(/^\d{4}/)?.[0],
    plot: str(d.plot_overview),
    genres: Array.isArray(d.genre_names) ? d.genre_names.map(str).filter((g): g is string => !!g) : [],
    runtime: minutes > 0 ? minutes * 60 : undefined, // seconds, like the TMDB adapter
    ratings,
    poster: url(d.poster),
    backdrop: url(d.backdrop),
    cert: str(d.us_rating),
    languages: lang && /^[a-z]{2,3}$/.test(lang) ? [lang] : undefined,
    ids: { tmdb: /^\d+$/.test(str(d.tmdb_id) ?? "") ? str(d.tmdb_id) : undefined, imdb: /^tt\d+$/.test(str(d.imdb_id) ?? "") ? str(d.imdb_id) : undefined },
  }
}

const KINDS: Record<string, AvailKind> = { sub: "sub", free: "free", tve: "tve", purchase: "purchase", rent: "purchase", buy: "purchase" }
const ORDER: AvailKind[] = ["sub", "free", "tve", "purchase"]

/** GET /title/{id}/sources/ -> one entry per service and kind (rent + buy are one "purchase"), cheapest price kept, ordered sub, free, tve, purchase. Entries without an http(s) web link are dropped. */
export function mapWatchmodeSources(j: unknown): Avail[] {
  const list: unknown[] = Array.isArray(j) ? j : Array.isArray(obj(j).sources) ? obj(j).sources : []
  const seen = new Map<string, { a: Avail; price?: number }>()
  for (const raw of list) {
    const x = obj(raw)
    const source = str(x.name), kind = KINDS[String(x.type).toLowerCase()], web = url(x.web_url)
    if (!source || !kind || !web) continue
    const n = Number(x.price)
    const price = n > 0 ? n : undefined
    const k = `${source.toLowerCase()}|${kind}`
    const prev = seen.get(k)
    if (!prev) seen.set(k, { a: { source, kind, ...(price != null ? { price: price.toFixed(2) } : {}), web }, price })
    else if (price != null && (prev.price == null || price < prev.price)) seen.set(k, { a: { ...prev.a, price: price.toFixed(2), web }, price })
  }
  return [...seen.values()].map((v) => v.a).map((a, i) => ({ a, i })).sort((p, q) => ORDER.indexOf(p.a.kind) - ORDER.indexOf(q.a.kind) || p.i - q.i).map((v) => v.a)
}

const MOVIE_TYPES = ["movie", "tv_movie", "short_film"]
const SERIES_TYPES = ["tv", "tv_series", "tv_miniseries", "tv_special"]
const flat = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")

/** GET /search/ -> the Watchmode id of the hit of the right kind (movie vs tv) whose year is closest. With `year`, a hit more than a year away is a different title; with `title`, an exact name beats a fuzzy one. */
export function watchmodeSearchHit(j: unknown, kind: "movie" | "series", year?: string, title?: string): { id: string } | null {
  const raw = Array.isArray(j) ? j : obj(j).title_results
  const want = kind === "series" ? SERIES_TYPES : MOVIE_TYPES
  const hits = (Array.isArray(raw) ? raw : []).map(obj).filter((h) => want.includes(String(h.type ?? h.tmdb_type).toLowerCase()) && str(h.id ?? h.title_id))
  const named = title ? hits.filter((h) => flat(h.name ?? h.title) === flat(title)) : []
  const want4 = Number(year?.match(/\d{4}/)?.[0]) || 0
  let best: J | undefined, bestD = Infinity
  for (const h of named.length ? named : hits) {
    const y = Number(h.year) || 0
    const d = want4 && y ? Math.abs(y - want4) : want4 ? 2 : 0 // 2 = year unknown on the hit
    if (want4 && y && d > 1) continue
    if (d < bestD) { best = h; bestD = d }
  }
  return best ? { id: str(best.id ?? best.title_id)! } : null
}
