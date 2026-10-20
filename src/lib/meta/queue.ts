import { create } from "zustand"
import { del, get } from "idb-keyval"
import type { Item } from "../types"
import { useApp } from "../store"
import { addPosters, hasPoster, useCatalog } from "../catalog"
import { isEmptyMeta, matchKey, normalizeCfg, titleLookupKey, titleMeta } from "./index"
import { forget } from "./cache"
import { foundOf, type Found } from "../merge-pure"

/** Background metadata queue: every movie / series a card shows is looked up once (the same cached lookup as Replace posters and Fix matches),
    newest first, 3 at a time, so posters and Detail are ready by the time they are opened. Skipped: live, Plex / Jellyfin (their server brings the
    metadata), titles with a metadata poster or a manual match, titles already queued this session. `n` = titles waiting (header chip).
    A cached lookup answers from IndexedDB without a request, so only titles never looked up cost a provider call. Off: Settings > Metadata (`autoMeta`). */
export const useMetaQueue = create<{ n: number; bad: number; rev: number; paused: boolean; waitUntil: number }>(() => ({ n: 0, bad: 0, rev: 0, paused: false, waitUntil: 0 })) // rev: any change, for the activity panel; waitUntil: backing off after failures (rate limited) until then
/** Pause (this session) / resume: what is being looked up finishes, nothing new starts. Off for good = Settings > Metadata. */
export const setQueuePaused = (paused: boolean) => { useMetaQueue.setState({ paused }); if (!paused) void run() }

const todo = new Map<string, Item>() // match key -> item; newest last
const seen = new Set<string>()
let now: Item[] = [] // being looked up
let recent: { item: Item; poster?: string }[] = [] // finished this session, newest first (last 30)
/** Titles no provider could identify (match key -> item id, `settings.unmatched`, synced across devices): listed in the activity panel for a manual match and never looked up again
    (until "Try again"). A manual match (settings.metaMatch) takes a title off the list. */
const unmatched = () => useApp.getState().settings.unmatched ?? {}
const setUnmatched = (u: Record<string, string>) => { useApp.getState().setSettings({ unmatched: Object.keys(u).length ? u : undefined }); bump() }
const UNMATCHED = "leen-meta-unmatched" // ponytail: old device-local list (key -> Item), moved into the setting once; drop this block after a release or two
void get<Record<string, Item>>(UNMATCHED).then((v) => {
  if (!v) return
  const u = { ...unmatched() }
  for (const k in v) u[k] ??= v[k].id
  setUnmatched(u)
  void del(UNMATCHED)
}).catch(() => {})
useApp.subscribe((s, p) => {
  if (s.settings.unmatched !== p.settings.unmatched) bump() // a sync brought or removed some
  if (s.settings.metaMatch === p.settings.metaMatch) return
  const u = { ...unmatched() }
  const done = Object.keys(u).filter((k) => s.settings.metaMatch?.[k])
  if (done.length) { for (const k of done) delete u[k]; setUnmatched(u) }
})
/** Look these titles up again (all when no keys): their cached "nothing found" is dropped and they rejoin the queue. */
export async function retryUnmatched(keys = Object.keys(unmatched())) {
  const cfgs = normalizeCfg(useApp.getState().settings.meta)
  const u = { ...unmatched() }
  const items = keys.map((k) => useCatalog.getState().byId.get(u[k])).filter((i): i is Item => !!i)
  for (const k of keys) { delete u[k]; seen.delete(k) }
  setUnmatched(u)
  await forget(items.map((i) => titleLookupKey(i, cfgs)))
  for (const i of items) wantMeta(i)
}
let running = false
const bump = () => useMetaQueue.setState((s) => ({ n: todo.size + now.length, bad: Object.keys(unmatched()).length, rev: s.rev + 1 })) // bad = titles waiting for a manual match
/** What the activity panel lists: in progress, waiting (next first), finished. Unmatched titles not in the catalog (their source is off or unreachable) stay hidden. */
export const queueSnapshot = () => ({ now, waiting: [...todo.values()].reverse(), recent, unmatched: Object.entries(unmatched()).flatMap(([k, id]) => { const item = useCatalog.getState().byId.get(id); return item ? [{ k, item }] : [] }) })
const nap = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** nothing can run (turned off, no keyed provider): forget the waiting titles, unseen, so they queue again once it can */
const drop = () => { for (const k of todo.keys()) seen.delete(k); todo.clear() }

export function wantMeta(item: Item) {
  if (item.kind === "live") return
  const st = useApp.getState()
  if (st.settings.autoMeta === false) return
  const k = matchKey(item)
  if (seen.has(k) || unmatched()[k]) return
  seen.add(k)
  const m = st.settings.metaMatch?.[k]
  if (hasPoster(k) || (m && typeof m !== "string" && m.poster)) return
  const src = st.sources.find((s) => s.id === (item.srcId ?? item.id.split("|")[0]))
  if (src?.type === "plex" || src?.type === "jellyfin") return
  todo.set(k, item)
  bump()
  void run()
}

async function run() {
  if (running) return
  running = true
  const found: Record<string, Found> = {}
  const flush = () => { if (Object.keys(found).length) { addPosters({ ...found }); for (const k in found) delete found[k] } }
  let strikes = 0
  try {
    while (todo.size && navigator.onLine && !useMetaQueue.getState().paused && useApp.getState().settings.autoMeta !== false) {
      const cfgs = normalizeCfg(useApp.getState().settings.meta)
      if (!cfgs.some((c) => c.id !== "xtream" && c.enabled && c.key)) { drop(); break } // no keyed provider: nothing can be looked up
      const batch = [...todo].slice(-3).reverse() // what the screen shows now goes first
      for (const [k] of batch) todo.delete(k)
      now = batch.map(([, i]) => i)
      bump()
      let failed = 0
      await Promise.all(batch.map(async ([k, item]) => {
        try {
          const m = await titleMeta(item, cfgs)
          if (isEmptyMeta(m)) { setUnmatched({ ...unmatched(), [k]: item.id }); return } // nothing found: kept for a manual match, not retried
          if (m.poster || m.backdrop || m.title) found[k] = foundOf(m)
          recent = [{ item, poster: m.poster }, ...recent].slice(0, 30)
        }
        catch { failed++; todo.set(k, item) } // rate limited / offline: back in line (titleMeta does not cache a failure)
      }))
      now = []
      bump()
      if (Object.keys(found).length >= 15) flush()
      if (failed) {
        if (++strikes > 3) break // ponytail: gives up for now; the next card shown or the device coming back online restarts it
        flush()
        const ms = 15000 * 2 ** (strikes - 1)
        useMetaQueue.setState({ waitUntil: Date.now() + ms })
        await nap(ms)
        useMetaQueue.setState({ waitUntil: 0 })
      } else { strikes = 0; await nap(250) }
    }
  } finally { if (useApp.getState().settings.autoMeta === false) drop(); flush(); now = []; running = false; bump() }
}
addEventListener("online", () => void run())
