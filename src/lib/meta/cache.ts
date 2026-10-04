import { del, get, getMany, keys, set } from "idb-keyval"

/** Metadata cache (IndexedDB + session memory) so a title/person/genre is fetched from a provider once, not on every visit.
    Entries: `{ at, v, e? }` (e = empty result: re-checked after a day, not a week). In-flight requests are shared, so two screens asking at once cost one API call. */
export const DAY = 864e5
export const META_TTL = 30 * DAY // provider data (title details, seasons, lookups) is re-fetched after this; Refresh metadata on Detail forces it sooner
const PREFIXES = ["meta", "season:", "person:", "genres:", "tm:", "om:"] // "meta" covers every metaN: cache version
const MAX = 3000 // entries kept; oldest ~30% are dropped when exceeded
type Entry<T> = { at: number; v: T; e?: 1 }

const flight = new Map<string, Promise<unknown>>()

/** Read-through cache: fresh hit -> value; miss/stale -> `load()` once (shared), stored with `ttl`. Failures are never cached. */
export function cached<T>(key: string, ttl: number, load: () => Promise<T>, isEmpty?: (v: T) => boolean): Promise<T> {
  const f = flight.get(key) as Promise<T> | undefined
  if (f) return f
  const p = (async () => {
    const c = await get<Entry<T>>(key).catch(() => undefined)
    if (c && Date.now() - c.at < (c.e ? DAY : ttl)) return c.v
    const v = await load()
    void set(key, { at: Date.now(), v, ...(isEmpty?.(v) ? { e: 1 as const } : {}) }).catch(() => {})
    return v
  })().finally(() => flight.delete(key))
  flight.set(key, p)
  return p
}

let pruned = false
/** Keep the cache bounded; runs once per session, a few seconds after the first lookup. */
export function scheduleCachePrune() {
  if (pruned) return
  pruned = true
  setTimeout(async () => {
    try {
      const ks = (await keys()).filter((k): k is string => typeof k === "string" && PREFIXES.some((p) => k.startsWith(p)))
      if (ks.length <= MAX) return
      const vals = await getMany<Entry<unknown> | undefined>(ks)
      const old = ks.map((k, i) => ({ k, at: vals[i]?.at ?? 0 })).sort((a, b) => a.at - b.at).slice(0, Math.ceil(ks.length * 0.3))
      await Promise.all(old.map((o) => del(o.k)))
    } catch { /* cache pruning is best effort */ }
  }, 8000)
}

/** Drop cached entries whose key starts with one of `prefixes` (and any request in flight for them): the next lookup goes to the provider. */
export async function forget(prefixes: string[]) {
  const hit = (k: unknown) => typeof k === "string" && prefixes.some((p) => k.startsWith(p))
  for (const k of [...flight.keys()]) if (hit(k)) flight.delete(k)
  await Promise.all((await keys()).filter(hit).map((k) => del(k as string))).catch(() => {})
}

/** Settings > Metadata: how many cached lookups there are, and a way to drop them. */
export async function cacheCount() { return (await keys()).filter((k) => typeof k === "string" && PREFIXES.some((p) => k.startsWith(p))).length }
export async function clearMetaCache() { await Promise.all((await keys()).filter((k) => typeof k === "string" && PREFIXES.some((p) => k.startsWith(p))).map((k) => del(k))); flight.clear() }

/** Settings > Metadata: this device's saved title lookups that found something (`meta5:<kind>:<title>:<year>:<panel id>:<manual match>:<providers>` -> Meta). */
export async function localLookups(): Promise<{ key: string; meta: { ids?: { tmdb?: string } } }[]> {
  const ks = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith("meta"))
  const vals = await getMany<Entry<{ ids?: { tmdb?: string } }> | undefined>(ks)
  return ks.flatMap((key, i) => (vals[i] && !vals[i]!.e && vals[i]!.v ? [{ key, meta: vals[i]!.v }] : []))
}

/** Settings > Fix matches: keys of every cached title lookup, found or empty (a title with none was never looked up). */
export async function allLookups(): Promise<string[]> { return (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith("meta")) }

/** Settings > Fix matches: keys of title lookups that found nothing (re-checked daily, so this is what is still missing). */
export async function emptyLookups(): Promise<string[]> {
  const ks = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith("meta"))
  const vals = await getMany<Entry<unknown> | undefined>(ks)
  return ks.filter((_, i) => vals[i]?.e)
}
