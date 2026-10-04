import { fetchT } from "@/lib/net"
import { cached, DAY, META_TTL } from "./cache"
import { cleanTitle, norm, tmdbId } from "./title"
import { pickTrailers } from "./trailers"
import { isGenericEpTitle } from "./episodes"
import { tmdbExtras } from "./facts-pure"
import { mapDiscover } from "./plex-discover-pure"
import { plexUrl } from "@/lib/plex"
import { sharedGet, sharedPut } from "./shared"
import { resolveKey, shareable, sharedKey } from "./shared-pure"
import type { Credit, EpisodeMeta, Person, PersonInfo, PersonRef, Provider, ProviderCfg, Rating, SimilarRef } from "./types"

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
      backdrops: Array.isArray(i.backdrop_path) ? i.backdrop_path.map(str).filter((x): x is string => !!x) : undefined,
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
const tmdbApi = (cfg: ProviderCfg) => async (path: string, params: Record<string, string> = {}, fresh = false): Promise<J> => {
  const run = async (): Promise<J> => {
    const bearer = cfg.key!.length > 40
    const u = new URL(TMDB + path)
    for (const [k, v] of Object.entries({ language: cfg.lang || "en-US", ...params })) u.searchParams.set(k, v)
    if (!bearer) u.searchParams.set("api_key", cfg.key!)
    return (await fetchT(u.href, 20000, bearer ? { headers: { Authorization: `Bearer ${cfg.key}` } } : undefined)).json()
  }
  // small lookups are cached here (title -> id, genre lists, discover pages); details/person responses are big and cached as Meta/PersonInfo by the callers
  const ttl = /^\/(search|find)\b/.test(path) ? META_TTL : path.startsWith("/genre") ? META_TTL : path.startsWith("/discover") ? 3 * DAY : 0
  if (!ttl || fresh) return !fresh && shareable(path) ? viaShared(cfg, path, params, run) : run()
  const key = `tm:${cfg.lang || "en-US"}:${path}?${new URLSearchParams(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : 1))).toString()}`
  return cached(key, ttl, async () => slim(await run()), (j) => !(j.results?.length || j.genres?.length || j.movie_results?.length || j.tv_results?.length))
}
/** Title / season responses: the shared cache first (one TMDB call for everyone), else TMDB, then written back. Refresh metadata skips the read for that title. */
const forced = new Map<string, number>() // TMDB id -> until when the shared cache is bypassed
export const forceTmdb = (id: string) => void forced.set(id, Date.now() + 120000)
async function viaShared(cfg: ProviderCfg, path: string, params: Record<string, string>, run: () => Promise<J>): Promise<J> {
  const key = sharedKey(params.language || cfg.lang || "en-US", path, params)
  if ((forced.get(path.split("/")[2]) ?? 0) < Date.now()) { const hit = await sharedGet(key, path); if (hit) return hit }
  const j = await run()
  sharedPut(key, path, j)
  return j
}
/** keep only the fields the matchers read, so thousands of cached searches stay small */
const KEEP = ["id", "title", "name", "original_title", "original_name", "release_date", "first_air_date"]
const slim = (j: J): J => (Array.isArray(j.results) ? { ...j, results: (j.results as J[]).map((x) => Object.fromEntries(KEEP.filter((k) => k in x).map((k) => [k, x[k]]))) } : j)

const genreCache = new Map<string, { id: number; name: string }[]>()
const tmdbGenres = async (cfg: ProviderCfg, tv: boolean) => {
  const key = `${tv}:${cfg.lang}`
  let g = genreCache.get(key)
  if (!g) genreCache.set(key, (g = ((await tmdbApi(cfg)(`/genre/${tv ? "tv" : "movie"}/list`)).genres ?? []) as { id: number; name: string }[]))
  return g
}
/** Age rating: the user's region first (Arabic: EG, SA, AE), then US, GB, then any country that has one. */
const certOf = (d: J, tv: boolean, cfg: ProviderCfg): string | undefined => {
  const lang = (cfg.lang || "en-US").split("-")
  const order = [lang[1], ...(lang[0] === "ar" ? ["EG", "SA", "AE"] : []), "US", "GB"].filter(Boolean)
  const all = ((tv ? d.content_ratings?.results : d.release_dates?.results) ?? []) as J[]
  const of = (r: J) => str(tv ? r.rating : ((r.release_dates ?? []) as J[]).map((x) => x.certification).find((c) => str(c)))
  for (const c of order) { const r = all.find((x) => x.iso_3166_1 === c); const v = r && of(r); if (v) return v }
  for (const r of all) { const v = of(r); if (v) return v }
}
/** Title logo in the user's language, else English, else any. SVG logos only exist at "original". */
const logoOf = (d: J, lang: string): string | undefined => {
  const l = (d.images?.logos ?? []) as J[]
  const hit = l.find((x) => x.iso_639_1 === lang) ?? l.find((x) => x.iso_639_1 === "en") ?? l[0]
  return hit ? `${IMG}/${String(hit.file_path).endsWith(".svg") ? "original" : "w500"}${hit.file_path}` : undefined
}
const person = (c: J): Person => ({ id: String(c.id), name: c.name, role: c.character || undefined, photo: c.profile_path ? `${IMG}/w185${c.profile_path}` : undefined })

const ref = (r: J): SimilarRef => ({ title: String(r.title ?? r.name), alt: str(r.original_title ?? r.original_name), year: String(r.release_date ?? r.first_air_date ?? "").slice(0, 4) || undefined })

/** The title request Detail makes (also used to fill the shared cache from a device's saved lookups: same params = same shared key).
    Logos need a language; backdrops are filtered back to textless ones by the mapper. The age rating rides in the same request. */
export const tmdbDetail = (kind: "movie" | "series", id: string, cfg: ProviderCfg): Promise<J> => {
  const tv = kind === "series", lang2 = (cfg.lang || "en").slice(0, 2)
  return tmdbApi(cfg)(`/${tv ? "tv" : "movie"}/${id}`, { append_to_response: `credits,similar,external_ids,videos,images,${tv ? "content_ratings" : "release_dates"}`, include_video_language: `${lang2},en,null`, include_image_language: `${lang2},en,null` })
}

const tmdb: Provider = {
  id: "tmdb",
  name: "TMDB",
  needsKey: true,
  hasLang: true,
  person: tmdbPerson,
  async season(id, n, cfg) {
    if (!cfg.key) return null
    const get = tmdbApi(cfg)
    const crew = (e: J, jobs: string[]) => ((e.crew ?? []) as J[]).filter((c) => jobs.includes(c.job)).map((c) => String(c.name))
    const map = (d: J): EpisodeMeta[] => ((d.episodes ?? []) as J[]).map((e) => ({
      num: Number(e.episode_number),
      title: str(e.name),
      plot: str(e.overview),
      still: e.still_path ? `${IMG}/w780${e.still_path}` : undefined,
      air: str(e.air_date),
      runtime: e.runtime ? e.runtime * 60 : undefined,
      rating: e.vote_count ? Number(e.vote_average).toFixed(1) : undefined,
      guests: ((e.guest_stars ?? []) as J[]).slice(0, 12).map(person),
      directors: crew(e, ["Director"]),
      writers: crew(e, ["Writer", "Screenplay", "Teleplay"]),
    }))
    const eps = map(await get(`/tv/${id}/season/${n}`))
    // untranslated episodes come back as "الحلقة 3" with no overview: fill those from en-US
    if (!(cfg.lang || "en-US").startsWith("en") && eps.some((e) => !e.plot || isGenericEpTitle(e.title))) {
      const en = map(await get(`/tv/${id}/season/${n}`, { language: "en-US" }).catch(() => ({})))
      for (const e of eps) {
        const x = en.find((y) => y.num === e.num)
        if (!x) continue
        e.plot ||= x.plot
        if (isGenericEpTitle(e.title) && !isGenericEpTitle(x.title)) e.title = x.title
      }
    }
    return eps
  },
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
    // the panel's own tmdb_id beats a title search (read straight from get_vod_info, so it works with the Xtream provider off)
    let id = tmdbId(q.ids.tmdb) ?? tmdbId(q.xtream?.tmdb_id ?? q.xtream?.tmdb)
    if (!id && q.ids.imdb) {
      const r = await get(`/find/${q.ids.imdb}`, { external_source: "imdb_id" })
      id = String((tv ? r.tv_results : r.movie_results)?.[0]?.id ?? "") || undefined
    }
    const search = async () => {
      const rk = resolveKey(q.kind, norm(q.title), q.year) // other users already found this title's id: skip the search
      const known = await sharedGet(rk, `/resolve/${q.kind}`)
      if (known) return String(known.id)
      const run = async (year?: string) => (await get(`/search/${tv ? "tv" : "movie"}`, { query: q.title, ...(year ? (tv ? { first_air_date_year: year } : { year }) : {}) })).results as J[] | undefined
      const res = (await run(q.year)) ?? []
      const all = res.length || !q.year ? res : ((await run()) ?? [])
      const name = (r: J) => norm(String(r.title ?? r.name ?? ""))
      const hit = all.find((r) => name(r) === norm(q.title)) ?? all[0] // exact title first, else TMDB's best guess
      if (hit) sharedPut(rk, `/resolve/${q.kind}`, { id: hit.id })
      return hit ? String(hit.id) : undefined
    }
    const lang2 = (cfg.lang || "en").slice(0, 2)
    const detail = (i: string) => tmdbDetail(q.kind, i, cfg)
    let d: J | undefined = id ? await detail(id).catch(() => undefined) : undefined // a stale/wrong panel id falls back to the title search
    if (!d) {
      if (!(id = await search())) return null
      d = await detail(id)
    }
    // TMDB never falls back between languages: an "ar" record often has no overview/genres/runtime/poster, so fill the gaps from en-US
    if (!(cfg.lang || "en-US").startsWith("en") && (!d.overview || !d.genres?.length || !(d.runtime || d.episode_run_time?.length) || !d.poster_path || !d.backdrop_path)) {
      const e: J = await get(`/${tv ? "tv" : "movie"}/${id}`, { language: "en-US" }).catch(() => ({}))
      for (const k of ["overview", "poster_path", "backdrop_path", "runtime"]) d[k] ||= e[k]
      if (!d.genres?.length) d.genres = e.genres
      if (!d.episode_run_time?.length) d.episode_run_time = e.episode_run_time
    }
    const date = String(d.release_date ?? d.first_air_date ?? "")
    const cast: Person[] = ((d.credits?.cast ?? []) as J[]).slice(0, 14).map(person)
    const directors: string[] = tv
      ? (d.created_by ?? []).map((c: J) => c.name)
      : (d.credits?.crew ?? []).filter((c: J) => c.job === "Director").map((c: J) => c.name)
    const rt = d.runtime ?? d.episode_run_time?.[0]
    return {
      title: str(d.title ?? d.name),
      year: date.slice(0, 4) || undefined,
      plot: str(d.overview),
      genres: (d.genres ?? []).map((g: J) => g.name),
      runtime: rt ? rt * 60 : undefined,
      ratings: d.vote_count ? [{ source: "TMDB", value: Number(d.vote_average).toFixed(1), votes: String(d.vote_count) }] : [],
      poster: d.poster_path ? `${IMG}/w500${d.poster_path}` : undefined,
      backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : undefined,
      backdrops: ((d.images?.backdrops ?? []) as J[]).filter((b) => !b.iso_639_1).slice(0, 6).map((b) => `${IMG}/w1280${b.file_path}`), // textless stills
      logo: logoOf(d, lang2),
      cert: certOf(d, tv, cfg),
      cast,
      directors,
      trailers: pickTrailers(d.videos?.results),
      similar: (d.similar?.results ?? []).slice(0, 20).map(ref),
      ids: { tmdb: id, imdb: str(d.external_ids?.imdb_id ?? d.imdb_id) },
      ...tmdbExtras(d, tv, IMG),
    }
  },
}

export type Candidate = SimilarRef & { id: string; poster?: string; backdrop?: string; overview?: string }
/** Manual "Match metadata": TMDB search with posters (uncached: the shared search cache is slimmed), or the one title of a pasted TMDB link / "tmdb 123". */
export async function tmdbSearch(kind: "movie" | "series", query: string, cfg: ProviderCfg): Promise<Candidate[]> {
  const tv = kind === "series"
  const get = tmdbApi(cfg)
  const cand = (r: J): Candidate => ({ ...ref(r), id: String(r.id), poster: r.poster_path ? `${IMG}/w185${r.poster_path}` : undefined, backdrop: r.backdrop_path ? `${IMG}/w1280${r.backdrop_path}` : undefined, overview: str(r.overview) })
  const id = query.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)|^\s*tmdb[:\s]*(\d+)\s*$/i)
  if (id) return [cand(await get(`/${tv ? "tv" : "movie"}/${id[1] ?? id[2]}`))]
  const { title, year } = cleanTitle(query) // "Title (2019)" narrows by year
  const run = async (y?: string) => ((await get(`/search/${tv ? "tv" : "movie"}`, { query: title, include_adult: "false", ...(y ? (tv ? { first_air_date_year: y } : { year: y }) : {}) }, true)).results ?? []) as J[]
  const res = await run(year)
  return (res.length || !year ? res : await run()).slice(0, 20).map(cand)
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
    const key = `om:${[...u.searchParams].filter(([k]) => k !== "apikey").map(([k, v]) => `${k}=${v}`).join("&")}`
    const r: J = await cached(key, 7 * DAY, async () => (await fetchT(u.href, 20000)).json(), (j) => j.Response === "False")
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
      awards: str(r.Awards),
      cert: /^(not rated|unrated|approved|passed)$/i.test(String(r.Rated)) ? undefined : str(r.Rated),
    }
  },
}

/* ---------- Plex Discover: Plex's own cloud catalog, no library needed. The key is a Plex account token. ---------- */
const plexDiscover: Provider = {
  id: "plex",
  name: "Plex Discover",
  needsKey: true,
  async fetch(q, cfg) {
    if (!cfg.key) return null
    const get = async (path: string, params: Record<string, string | number> = {}): Promise<J> =>
      (await fetchT(plexUrl("https://metadata.provider.plex.tv", path, params, cfg.key), 20000, { headers: { Accept: "application/json" } })).json()
    const find = async (year?: string) => (await get("/library/metadata/matches", { type: q.kind === "series" ? 2 : 1, title: q.title, ...(year ? { year } : {}) })).MediaContainer?.Metadata?.[0]
    const hit = (await find(q.year)) ?? (q.year ? await find() : undefined) // a wrong panel year matches nothing: ask again without it
    if (!hit?.ratingKey) return null
    const d = (await get(`/library/metadata/${hit.ratingKey}`)).MediaContainer?.Metadata?.[0]
    return d ? mapDiscover(d) : null
  },
}

/** Add a new source = write one Provider above and list it here; Settings > Metadata picks it up. */
export const PROVIDERS: Provider[] = [xtream, tmdb, omdb, plexDiscover]
export const DEFAULT_CFG = [{ id: "xtream", enabled: true }, { id: "tmdb", enabled: false }, { id: "omdb", enabled: false }]
