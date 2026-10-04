import { HttpError } from "../net"
import type { Item } from "../types"
import { paced } from "../pace"
import { useApp } from "../store"
import { useCatalog, addPosters, hasPoster } from "../catalog"
import { matchKey, normalizeCfg, titleMeta } from "./index"
import { localLookups } from "./cache"
import { tmdbDetail } from "./providers"
import { sharedLastError, sharedPut, sharedResume, sharedUsable } from "./shared"
import { resolveKey } from "./shared-pure"

/** Fill the shared table from this device's saved lookups.
    - title -> TMDB id rows come straight from the saved keys (no request to TMDB), only for ids found by title search (no panel id, no manual match);
    - with a TMDB key, each title's full response is requested through the shared path: read from the shared table if somebody stored it, else one TMDB call and written back
      (the device keeps mapped data, not TMDB's raw response, so it cannot be uploaded as it is). Paced like Auto fix. */
export async function uploadLocal(stop: { current: boolean }, onState: (done: number, total: number, waiting: boolean) => void): Promise<{ ids: number; titles: number; total: number; done: number; usable: boolean; error: string }> {
  const cfg = normalizeCfg(useApp.getState().settings.meta).find((c) => c.id === "tmdb" && c.enabled && c.key)
  const ids = new Map<string, [string, string]>() // shared key -> [path, tmdb id]
  const titles = new Map<string, ["movie" | "series", string]>() // kind:tmdb id
  for (const { key, meta } of await localLookups()) {
    const [, kind, title, year, xid, matched] = key.split(":") // the providers signature after these fields has colons of its own
    const id = meta.ids?.tmdb
    if (!id || !/^\d+$/.test(id) || (kind !== "movie" && kind !== "series")) continue
    titles.set(`${kind}:${id}`, [kind, id])
    if (!xid && !matched && title) ids.set(resolveKey(kind, title, year || undefined), [`/resolve/${kind}`, id])
  }
  let nIds = 0, nTitles = 0
  const jobs: (() => Promise<void>)[] = [
    ...[...ids].map(([k, [path, id]]) => async () => { sharedPut(k, path, { id: Number(id) }); nIds++ }),
    ...(cfg ? [...titles.values()].map(([kind, id]) => async () => {
      try { await tmdbDetail(kind, id, cfg); nTitles++ } catch (e) { if (!(e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401)) throw e } // a title TMDB no longer has: skip it, do not back off
    }) : []),
  ]
  sharedResume()
  if (!(await sharedUsable())) return { ids: 0, titles: 0, total: jobs.length, done: 0, usable: false, error: "" }
  const done = await paced(jobs, async (j) => {
    if (!(await sharedUsable())) { stop.current = true; return } // a failed shared call pauses sharing: stop instead of spending TMDB calls that cannot be stored
    await j()
  }, { stop, onState: (done, waiting) => onState(done, jobs.length, waiting) })
  return { ids: nIds, titles: nTitles, total: jobs.length, done, usable: true, error: sharedLastError() }
}

/** Settings > Metadata > Replace posters: look up every movie / series of the Xtream and M3U sources (Plex and Jellyfin bring their own art) and keep the metadata poster for the catalog.
    Uses the same cached lookup as Fix matches, so Detail opens instantly afterwards. Paced; titles done earlier are skipped, so a stopped run resumes. */
export async function fetchPosters(stop: { current: boolean }, onState: (done: number, total: number, waiting: boolean) => void): Promise<{ done: number; total: number; found: number; usable: boolean }> {
  const cfgs = normalizeCfg(useApp.getState().settings.meta)
  if (!cfgs.some((c) => c.id !== "xtream" && c.enabled && c.key)) return { done: 0, total: 0, found: 0, usable: false }
  const own = new Set(useApp.getState().sources.filter((s) => s.type === "plex" || s.type === "jellyfin").map((s) => s.id))
  const todo = new Map<string, Item>()
  for (const i of useCatalog.getState().items) {
    const k = i.kind === "live" || own.has(i.srcId ?? i.id.split("|")[0]) ? "" : matchKey(i)
    if (k && !todo.has(k) && !hasPoster(k)) todo.set(k, i)
  }
  const found: Record<string, string> = {}
  const flush = () => { if (Object.keys(found).length) { addPosters(found); for (const k in found) delete found[k] } }
  let n = 0
  const done = await paced([...todo], async ([k, item]) => {
    const m = await titleMeta(item, cfgs)
    if (m.poster) { found[k] = m.poster; n++ }
  }, { stop, onState: (d, w) => onState(d, todo.size, w), onBatch: flush })
  flush()
  return { done, total: todo.size, found: n, usable: true }
}
