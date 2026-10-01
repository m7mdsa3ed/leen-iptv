import { fetchT } from "@/lib/net"
import { norm } from "./title"
import type { Credit, Person, PersonInfo, PersonRef, Provider, ProviderCfg, Rating, SimilarRef } from "./types"

const list = (v: unknown) => String(v ?? "").split(/\s*,\s*/).map((x) => x.trim()).filter((x) => x && x !== "N/A")
const str = (v: unknown) => (v == null || v === "" || v === "N/A" ? undefined : String(v))

/* ---------- Xtream: whatever the panel already knows (no network, no key) ---------- */
const xtream: Provider = {
  id: "xtream",
  name: "Xtream panel",
  needsKey: false,
  async fetch(q) {
    const i = q.xtream
    if (!i) return null
    const rating: Rating[] = []
    if (str(i.rating_imdb)) rating.push({ source: "IMDb", value: String(i.rating_imdb) })
    else if (str(i.rating) && Number(i.rating) > 0) rating.push({ source: "Rating", value: String(i.rating) })
    const bd = Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : i.backdrop_path
    return {
      plot: str(i.plot) ?? str(i.description),
      genres: list(i.genre),
      runtime: str(i.duration),
      year: str(i.releasedate ?? i.releaseDate ?? i.year)?.slice(0, 4),
      ratings: rating,
      poster: str(i.movie_image ?? i.cover),
      backdrop: str(bd),
      cast: list(i.cast ?? i.actors).map((name) => ({ name })),
      directors: list(i.director),
      ids: { tmdb: str(i.tmdb_id ?? i.tmdb), imdb: str(i.imdb_id) },
    }
  },
}

/* ---------- TMDB ---------- */
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const TMDB = "https://api.themoviedb.org/3"
const IMG = "https://image.tmdb.org/t/p"

/** Authenticated TMDB GET: 32-char v3 key as ?api_key, long v4 read token as Bearer. */
const tmdbApi = (cfg: ProviderCfg) => async (path: string, params: Record<string, string> = {}): Promise<J> => {
  const bearer = cfg.key!.length > 40
  const u = new URL(TMDB + path)
  for (const [k, v] of Object.entries({ language: cfg.lang || "en-US", ...params })) u.searchParams.set(k, v)
  if (!bearer) u.searchParams.set("api_key", cfg.key!)
  return (await fetchT(u.href, 20000, bearer ? { headers: { Authorization: `Bearer ${cfg.key}` } } : undefined)).json()
}

const genreCache = new Map<string, { id: number; name: string }[]>()
const tmdbGenres = async (cfg: ProviderCfg, tv: boolean) => {
  const key = `${tv}:${cfg.lang}`
  let g = genreCache.get(key)
  if (!g) genreCache.set(key, (g = ((await tmdbApi(cfg)(`/genre/${tv ? "tv" : "movie"}/list`)).genres ?? []) as { id: number; name: string }[]))
  return g
}
const ref = (r: J): SimilarRef => ({ title: String(r.title ?? r.name), alt: str(r.original_title ?? r.original_name), year: String(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || undefined })

const tmdb: Provider = {
  id: "tmdb",
  name: "TMDB",
  needsKey: true,
  hasLang: true,
  hint: "Free key at themoviedb.org/settings/api (API key or read access token). Also powers cast profiles.",
  person: tmdbPerson,
  async genres(kind, cfg) {
    return cfg.key ? (await tmdbGenres(cfg, kind === "series")).map((g) => g.name) : null
  },
  async discover(kind, genre, page, cfg) {
    if (!cfg.key) return null
    const tv = kind === "series"
    const g = (await tmdbGenres(cfg, tv)).find((x) => x.name.toLowerCase() === genre.toLowerCase())
    if (!g) return null
    const r = await tmdbApi(cfg)(`/discover/${tv ? "tv" : "movie"}`, { with_genres: String(g.id), sort_by: "popularity.desc", "vote_count.gte": "20", include_adult: "false", page: String(page) })
    return { refs: ((r.results ?? []) as J[]).map(ref), pages: Math.min(Number(r.total_pages) || 1, 25) }
  },
  async fetch(q, cfg) {
    if (!cfg.key) return null
    const tv = q.kind === "series"
    const get = tmdbApi(cfg)
    let id = q.ids.tmdb
    if (!id && q.ids.imdb) {
      const r = await get(`/find/${q.ids.imdb}`, { external_source: "imdb_id" })
      id = String((tv ? r.tv_results : r.movie_results)?.[0]?.id ?? "") || undefined
    }
    if (!id) {
      const search = async (year?: string) => (await get(`/search/${tv ? "tv" : "movie"}`, { query: q.title, ...(year ? (tv ? { first_air_date_year: year } : { year }) : {}) })).results as J[] | undefined
      const res = (await search(q.year)) ?? []
      const all = res.length || !q.year ? res : ((await search()) ?? [])
      const name = (r: J) => norm(String(r.title ?? r.name ?? ""))
      const hit = all.find((r) => name(r) === norm(q.title)) ?? all[0] // exact title first, else TMDB's best guess
      id = hit ? String(hit.id) : undefined
    }
    if (!id) return null
    const d = await get(`/${tv ? "tv" : "movie"}/${id}`, { append_to_response: "credits,similar,external_ids" })
    const date = String(d.release_date ?? d.first_air_date ?? "")
    const cast: Person[] = (d.credits?.cast ?? []).slice(0, 14).map((c: J) => ({ id: String(c.id), name: c.name, role: c.character || undefined, photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined }))
    const directors: string[] = tv
      ? (d.created_by ?? []).map((c: J) => c.name)
      : (d.credits?.crew ?? []).filter((c: J) => c.job === "Director").map((c: J) => c.name)
    const rt = d.runtime ?? d.episode_run_time?.[0]
    return {
      title: str(d.title ?? d.name),
      year: date.slice(0, 4) || undefined,
      plot: str(d.overview),
      genres: (d.genres ?? []).map((g: J) => g.name),
      runtime: rt ? `${rt} min` : undefined,
      ratings: d.vote_count ? [{ source: "TMDB", value: Number(d.vote_average).toFixed(1), votes: String(d.vote_count) }] : [],
      poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : undefined,
      backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : undefined,
      cast,
      directors,
      similar: (d.similar?.results ?? []).slice(0, 20).map(ref),
      ids: { tmdb: id, imdb: str(d.external_ids?.imdb_id ?? d.imdb_id) },
    }
  },
}

/** TMDB person profile with combined credits. Without an id we search by name (exact match preferred). */
async function tmdbPerson(ref: PersonRef, cfg: ProviderCfg): Promise<PersonInfo | null> {
  if (!cfg.key) return null
  const get = tmdbApi(cfg)
  let id = ref.id
  if (!id) {
    const res = ((await get("/search/person", { query: ref.name })).results ?? []) as J[]
    const hit = res.find((r) => norm(String(r.name)) === norm(ref.name)) ?? res[0]
    id = hit ? String(hit.id) : undefined
  }
  if (!id) return null
  const d = await get(`/person/${id}`, { append_to_response: "combined_credits,external_ids" })
  let bio = str(d.biography)
  if (!bio && (cfg.lang || "en-US") !== "en-US") bio = str((await get(`/person/${id}`, { language: "en-US" })).biography) // many people have no translated bio
  const credits = new Map<string, Credit>()
  const add = (c: J, role?: string) => {
    if (c.media_type !== "movie" && c.media_type !== "tv") return
    const kind = c.media_type === "tv" ? "series" : "movie"
    const key = `${kind}:${c.id}`
    const prev = credits.get(key)
    if (prev) return void (role && !prev.role?.includes(role) && (prev.role = prev.role ? `${prev.role}, ${role}` : role))
    credits.set(key, { id: key, title: String(c.title ?? c.name), year: String(c.release_date ?? c.first_air_date ?? "").slice(0, 4) || undefined, kind, role, poster: c.poster_path ? `${IMG}/w342${c.poster_path}` : undefined, popularity: Number(c.popularity) || 0 })
  }
  for (const c of (d.combined_credits?.cast ?? []) as J[]) add(c, str(c.character))
  for (const c of (d.combined_credits?.crew ?? []) as J[]) if (["Director", "Writer", "Screenplay", "Creator"].includes(c.job)) add(c, c.job)
  return {
    id,
    name: String(d.name ?? ref.name),
    photo: d.profile_path ? `${IMG}/w500${d.profile_path}` : undefined,
    bio,
    birthday: str(d.birthday),
    deathday: str(d.deathday),
    birthplace: str(d.place_of_birth),
    department: str(d.known_for_department),
    aka: ((d.also_known_as ?? []) as string[]).slice(0, 4),
    homepage: str(d.homepage),
    imdb: str(d.external_ids?.imdb_id),
    credits: [...credits.values()].sort((a, b) => b.popularity - a.popularity),
  }
}

/* ---------- OMDb (ratings: IMDb, Rotten Tomatoes, Metascore) ---------- */
const omdb: Provider = {
  id: "omdb",
  name: "OMDb",
  needsKey: true,
  hint: "Free key at omdbapi.com/apikey.aspx (1,000 requests/day).",
  async fetch(q, cfg) {
    if (!cfg.key) return null
    const u = new URL("https://www.omdbapi.com/")
    u.searchParams.set("apikey", cfg.key)
    u.searchParams.set("plot", "full")
    if (q.ids.imdb) u.searchParams.set("i", q.ids.imdb)
    else {
      u.searchParams.set("t", q.title)
      u.searchParams.set("type", q.kind)
      if (q.year) u.searchParams.set("y", q.year)
    }
    const r: J = await (await fetchT(u.href, 20000)).json()
    if (r.Response === "False") return null
    const ratings: Rating[] = []
    if (str(r.imdbRating)) ratings.push({ source: "IMDb", value: r.imdbRating, votes: str(r.imdbVotes) })
    for (const x of (r.Ratings ?? []) as J[]) if (x.Source === "Rotten Tomatoes") ratings.push({ source: "Rotten Tomatoes", value: x.Value })
    if (str(r.Metascore)) ratings.push({ source: "Metascore", value: r.Metascore })
    return {
      title: str(r.Title),
      year: str(r.Year)?.slice(0, 4),
      plot: str(r.Plot),
      genres: list(r.Genre),
      runtime: str(r.Runtime),
      ratings,
      poster: str(r.Poster),
      cast: list(r.Actors).map((name) => ({ name })), // names only: used when no provider has photos
      directors: list(r.Director),
      ids: { imdb: str(r.imdbID) },
    }
  },
}

/** Add a new source = write one Provider above and list it here; Settings > Metadata picks it up. */
export const PROVIDERS: Provider[] = [xtream, tmdb, omdb]
export const DEFAULT_CFG = [{ id: "xtream", enabled: true }, { id: "tmdb", enabled: false }, { id: "omdb", enabled: false }]
