// Maps one title of Plex's cloud metadata (metadata.provider.plex.tv, "Plex Discover") to Meta fields. No alias imports so `node scripts/meta.check.ts` can test it.
import type { Meta, Rating } from "./types"
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const tags = (a: unknown) => ((a ?? []) as J[]).map((x) => String(x.tag ?? "")).filter(Boolean)

export function mapDiscover(d: J): Partial<Meta> {
  const guid = (p: string) => ((d.Guid ?? []) as J[]).map((g) => String(g.id)).find((i) => i.startsWith(p))?.slice(p.length)
  const art = (t: string) => ((d.Image ?? []) as J[]).find((i) => i.type === t)?.url as string | undefined
  const ratings: Rating[] = []
  for (const r of (d.Rating ?? []) as J[]) {
    const v = Number(r.value), src = String(r.image)
    if (!(v > 0)) continue
    if (src.startsWith("imdb")) ratings.push({ source: "IMDb", value: v.toFixed(1) })
    else if (src.startsWith("rottentomatoes") && r.type === "critic") ratings.push({ source: "Rotten Tomatoes", value: `${Math.round(v * 10)}%` }) // Plex scales it to /10, OMDb says 86%
    else if (src.startsWith("themoviedb")) ratings.push({ source: "TMDB", value: v.toFixed(1) })
  }
  return {
    title: d.title || undefined,
    year: d.year ? String(d.year) : undefined,
    plot: d.summary || undefined,
    genres: tags(d.Genre),
    runtime: d.duration ? Math.round(d.duration / 1000) : undefined,
    ratings,
    poster: d.thumb || art("coverPoster"),
    backdrop: d.art || art("background"),
    logo: art("clearLogo"),
    cert: d.contentRating ? String(d.contentRating).replace(/^[a-z]{2}\//i, "") : undefined, // "gb/15" -> "15"
    cast: ((d.Role ?? []) as J[]).slice(0, 14).map((r) => ({ name: String(r.tag), role: r.role || undefined, photo: r.thumb || undefined })), // no id: Plex ids mean nothing to the TMDB person lookup, it searches by name
    directors: tags(d.Director),
    similar: tags(d.Similar).slice(0, 20).map((title) => ({ title })),
    ids: { tmdb: guid("tmdb://"), imdb: guid("imdb://") },
  }
}
