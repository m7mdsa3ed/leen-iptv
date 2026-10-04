// Pure helpers of the shared (server-side) metadata cache; no alias imports so `node scripts/meta.check.ts` can test them.
type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export const SHARED_V = 1 // bump when the stored shape changes: old rows are then never read

/** Only objective TMDB data is shared: a title / show / season by id, and the resolved id of a cleaned title (`/resolve/<kind>`, below). Raw searches stay on the device. */
export const shareable = (path: string) => /^\/(movie|tv)\/\d+(\/season\/\d+)?$/.test(path)

/** Which TMDB id a cleaned title (+ year) resolved to, so the next user skips the search. Language-free: `any` in the lang slot. Only found titles are stored, never misses. */
export const resolveKey = (kind: "movie" | "series", normTitle: string, year?: string) => `tmdb:v${SHARED_V}:any:/resolve/${kind}?title=${normTitle.slice(0, 120)}&year=${year ?? ""}`

/** `tmdb:v1:<lang>:<path>?<other params, sorted>` (matches the CHECK on meta_cache.key in the schema file). */
export function sharedKey(lang: string, path: string, params: Record<string, string>): string {
  const q = Object.entries(params).filter(([k]) => k !== "language").sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&")
  return `tmdb:v${SHARED_V}:${lang}:${path}?${q}`
}

/** A row read from the shared table is somebody else's data: accept it only if it looks like the response asked for. */
export function validShared(path: string, j: unknown): j is J {
  if (!j || typeof j !== "object" || Array.isArray(j)) return false
  if (/^\/resolve\/(movie|series)$/.test(path)) return /^[1-9]\d{0,9}$/.test(String((j as J).id))
  const m = path.match(/^\/(movie|tv)\/(\d+)(\/season\/\d+)?$/)
  if (!m) return false
  return m[3] ? Array.isArray((j as J).episodes) : Number((j as J).id) === Number(m[2])
}

/** What is stored for a row: the provider's full response as it came (so a later change of mapping or provider can re-read it), except a /resolve/ row, which is only the id. */
export const shareBody = (path: string, d: J): J => (path.startsWith("/resolve/") ? { id: Number(d.id) } : d)
