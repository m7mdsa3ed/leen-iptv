import type { Trailer } from "./types"

/** TMDB `videos.results` -> up to 3 YouTube trailers (else teasers), official first, newest first. */
export function pickTrailers(results: unknown): Trailer[] {
  const yt = (Array.isArray(results) ? results : []).filter((v) => v && v.site === "YouTube" && v.key && (v.type === "Trailer" || v.type === "Teaser"))
  const rank = (v: { type: string; official?: boolean }) => (v.type === "Trailer" ? 0 : 2) + (v.official ? 0 : 1)
  yt.sort((a, b) => rank(a) - rank(b) || String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")))
  const kind = yt.some((v) => v.type === "Trailer") ? "Trailer" : "Teaser"
  return yt.filter((v) => v.type === kind).slice(0, 3).map((v) => ({ key: String(v.key), name: String(v.name ?? ""), site: "YouTube" as const, official: !!v.official, type: kind }))
}
