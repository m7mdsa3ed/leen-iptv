export interface Person { id?: string; name: string; role?: string; photo?: string }
export interface Rating { source: string; value: string; votes?: string }
export interface SimilarRef { title: string; year?: string; alt?: string } // alt = original-language title
export interface Trailer { key: string; name: string; site: "YouTube"; official?: boolean; type: string }
export interface Ids { tmdb?: string; imdb?: string }

/** Normalized info about a movie/series, whatever provider it came from. */
export interface Meta {
  title?: string
  year?: string
  plot?: string
  genres: string[]
  runtime?: string | number // number = seconds
  ratings: Rating[]
  poster?: string
  backdrop?: string
  backdrops?: string[] // extra stills (the first is usually `backdrop`)
  cast: Person[]
  directors: string[]
  similar: SimilarRef[]
  ids: Ids
  trailers?: Trailer[]
}

export interface Query {
  kind: "movie" | "series"
  title: string // cleaned (no tags / year)
  year?: string
  ids: Ids // grows as providers run: TMDB finds the IMDb id, OMDb can then use it
  xtream?: Record<string, unknown> // what the Xtream panel already told us about this title
}

/** A title a person worked on. */
export interface Credit { id: string; title: string; year?: string; kind: "movie" | "series"; role?: string; poster?: string; popularity: number }
export interface PersonRef { id?: string; name: string }
export interface PersonInfo {
  id?: string
  name: string
  photo?: string
  bio?: string
  birthday?: string
  deathday?: string
  birthplace?: string
  department?: string
  aka: string[]
  homepage?: string
  imdb?: string
  credits: Credit[]
}

/** One entry of Settings > Metadata, in priority order. */
export interface ProviderCfg { id: string; enabled: boolean; key?: string; lang?: string }

/** A metadata source. Return only the fields you know; earlier providers win per field. */
export interface Provider {
  id: string
  name: string
  needsKey: boolean
  hasLang?: boolean
  fetch(q: Query, cfg: ProviderCfg): Promise<Partial<Meta> | null>
  /** Optional: genre names for "movie" / "series" (powers the genre pills). */
  genres?(kind: "movie" | "series", cfg: ProviderCfg): Promise<string[] | null>
  /** Optional: popular titles of a genre, one page at a time (matched against the user's catalog by the caller). */
  discover?(kind: "movie" | "series", genre: string, page: number, cfg: ProviderCfg): Promise<{ refs: SimilarRef[]; pages: number } | null>
  /** Optional: full profile of a cast/crew member. */
  person?(ref: PersonRef, cfg: ProviderCfg): Promise<PersonInfo | null>
}
