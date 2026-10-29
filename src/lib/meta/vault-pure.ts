// Pure core of the metadata middleman (the "vault"): the one unified Meta that every provider's answer is merged into,
// and the key/validation of the row it is stored under. No alias imports so `node scripts/meta.check.ts` can test it.
import type { Avail, EpisodeMeta, Ids, Meta, PersonInfo, PersonRef, Query } from "./types.ts"
import { norm } from "./title.ts"

/** Bump when the stored shape changes: rows written by an older app are then never read. */
export const VAULT_V = 1

export const emptyMeta = (): Meta => ({ genres: [], ratings: [], cast: [], directors: [], similar: [], ids: {} })

/** The fields a later provider may not overwrite once they have a value. */
const SCALARS = ["title", "year", "plot", "poster", "backdrop", "logo", "cert", "awards"] as const
const LISTS = ["genres", "directors", "similar"] as const
const MISC = ["tagline", "original", "status", "next"] as const

/**
 * Merge one provider's answer into the unified record: the first non-empty value per field wins, ratings from every
 * provider are kept (one per source), and ids found earlier are handed to the providers that run after (`ids`).
 */
export function applyPart(m: Meta, r: Partial<Meta> | null | undefined, ids: Ids): void {
  if (!r) return
  for (const k of SCALARS) m[k] ||= r[k]
  m.runtime ||= r.runtime
  if (!m.backdrops?.length && r.backdrops?.length) m.backdrops = r.backdrops
  if (!m.trailers?.length && r.trailers?.length) m.trailers = r.trailers
  for (const k of MISC) (m as unknown as Record<string, unknown>)[k] ||= r[k]
  for (const k of ["languages", "countries", "studios", "crew", "seasons"] as const) if (!m[k]?.length && r[k]?.length) (m[k] as unknown[]) = r[k]!
  for (const k of LISTS) if (!m[k].length && r[k]?.length) (m[k] as unknown[]) = r[k]!
  // cast: names-only lists (Xtream, OMDb) give way to a list that has photos
  if (r.cast?.length && (!m.cast.length || (!m.cast.some((c) => c.photo) && r.cast.some((c) => c.photo)))) m.cast = r.cast
  for (const x of r.ratings ?? []) if (!m.ratings.some((y) => y.source === x.source)) m.ratings.push(x)
  ids.tmdb ||= r.ids?.tmdb
  ids.imdb ||= r.ids?.imdb
}

/** Every provider's answer in priority order -> one unified Meta. Pure twin of the live fan-out, which also threads ids into each call. */
export function mergeParts(parts: (Partial<Meta> | null | undefined)[], ids: Ids = {}): Meta {
  const m = emptyMeta()
  for (const r of parts) applyPart(m, r, ids)
  m.ids = { ...ids }
  return m
}

/** Language the record was built in: the first provider that has one picks it, else `any` (still one shared record per title). */
export const vaultLang = (lang: string | undefined) => (lang ? lang.slice(0, 2).toLowerCase() : "any")

/* ---------- one record per thing looked up, each with its own key and its own validator ---------- */
/** Where a title can be watched (Watchmode sources): region-specific and short-lived. */
export type AvailRec = { avail: Avail[] }
/** One season's episodes of a series (by the provider's own id, which is language-independent). */
export type SeasonRec = { eps: EpisodeMeta[] }
/** One person's profile. */
export type PersonRec = { info: PersonInfo }

/**
 * Key of the unified record: what the thing IS, never the source, the item id or the profile, so it is reused across
 * profiles, panels and devices. Language is part of a title's key because providers translate titles, plots and
 * posters (seasons are keyed by provider id instead, people have no translation of their own).
 */
export function vaultKey(q: Query, lang?: string): string {
  return `t${VAULT_V}:${vaultLang(lang)}:${q.kind}:${norm(q.title).slice(0, 120)}:${q.year ?? ""}`
}
/** Key of a season record. TMDB ids are numeric, but a provider id is whatever the provider uses: normalised, not trusted. */
export const seasonKey = (id: string, season: number) => `s${VAULT_V}:any:${String(id).replace(/[^A-Za-z0-9]/g, "").slice(0, 40)}:${Math.max(0, Math.floor(season))}`
/** Key of a person record: the provider id when the app has one, else the name it was opened by. */
export const personKey = (ref: PersonRef) => `p${VAULT_V}:any:${ref.id ? String(ref.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 40) : norm(ref.name).slice(0, 80)}`
/** Key of a "where to watch" record: one country, one title. Prices and services differ per country, so the region is part of the key. */
export const availKey = (q: Query, region: string) => `a${VAULT_V}:${(region || "EG").toLowerCase().slice(0, 5)}:${q.kind}:${norm(q.title).slice(0, 120)}:${q.year ?? ""}`

const isStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length < 2000
const isStrArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string")

/**
 * A row read back from the database is somebody else's data: accept it only if it has the shape of a Meta, and only
 * if it says something about the title (a record with neither a plot nor a cast is treated as "not found" and refreshed).
 */
export function validVault(j: unknown): j is Meta {
  if (!j || typeof j !== "object" || Array.isArray(j)) return false
  const m = j as Record<string, unknown>
  for (const k of ["title", "year", "plot", "poster", "backdrop", "logo", "cert", "awards", "runtime"] as const)
    if (m[k] !== undefined && typeof m[k] !== "string" && typeof m[k] !== "number") return false
  for (const k of ["genres", "directors", "cast", "similar", "ratings"] as const) if (!Array.isArray(m[k])) return false
  if (!m.ids || typeof m.ids !== "object") return false
  for (const k of ["genres", "directors"] as const) if (!isStrArr(m[k])) return false
  const cast = m.cast as Record<string, unknown>[]
  if (!cast.every((c) => c && typeof c === "object" && isStr(c.name))) return false
  const ratings = m.ratings as Record<string, unknown>[]
  if (!ratings.every((r) => r && typeof r === "object" && isStr(r.source) && isStr(r.value))) return false
  return !!(str(m.plot) || cast.length)
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined)

/** A season row: episodes with a positive number. An empty list is "not found" (never stored). */
export function validSeason(j: unknown): j is SeasonRec {
  const eps = (j as SeasonRec | null)?.eps
  return Array.isArray(eps) && eps.length > 0 && eps.every((e) => e && typeof e === "object" && Number(e.num) > 0)
}

/** A person row: a name at least, so a half-empty profile never hides a real one. */
export function validPerson(j: unknown): j is PersonRec {
  const info = (j as PersonRec | null)?.info
  return !!info && typeof info === "object" && !Array.isArray(info) && isStr((info as PersonInfo).name) && Array.isArray((info as PersonInfo).credits)
}

/** A "where to watch" row: a list of offers (an empty list is a real answer: the title is not streaming there). */
export function validAvail(j: unknown): j is AvailRec {
  const a = (j as AvailRec | null)?.avail
  return Array.isArray(a) && a.every((x) => x && typeof x === "object" && isStr(x.source) && isStr(x.kind))
}

/** Nothing was found (the row is not worth storing, and the title counts as unmatched). */
export const isEmptyMeta = (x: Meta) => !(x.plot || x.cast.length)

/**
 * What is stored: the unified Meta trimmed to what the app shows. Provider payloads stay in the existing per-provider
 * shared cache; this row is only the merged answer, so it stays a few KB whatever the providers sent.
 */
export function vaultBody(m: Meta): Meta {
  const out: Meta = {
    genres: m.genres.slice(0, 12),
    ratings: m.ratings.slice(0, 6),
    cast: m.cast.slice(0, 20),
    directors: m.directors.slice(0, 8),
    similar: m.similar.slice(0, 20),
    ids: m.ids,
  }
  for (const k of SCALARS) if (m[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = m[k]
  if (m.runtime !== undefined) out.runtime = m.runtime
  if (m.backdrops?.length) out.backdrops = m.backdrops.slice(0, 6)
  if (m.trailers?.length) out.trailers = m.trailers.slice(0, 6)
  if (m.crew?.length) out.crew = m.crew.slice(0, 12)
  if (m.seasons?.length) out.seasons = m.seasons
  for (const k of MISC) { const v = (m as unknown as Record<string, unknown>)[k]; if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v }
  for (const k of ["languages", "countries", "studios"] as const) if (m[k]?.length) (out[k] as unknown[]) = m[k]!.slice(0, 12)
  return out
}
