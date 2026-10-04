import { syncBackend as api } from "@/lib/api"
import { sharedAuth } from "../sync"
import { useApp } from "../store"
import { META_TTL } from "./cache"
import { shareBody, validShared } from "./shared-pure"

type J = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Shared metadata cache (server table meta_cache, see the schema file): signed-in devices read a title here before calling TMDB and write what TMDB returned.
    Best effort and never blocking for long: any failure (signed out, offline, table not created yet) falls through to TMDB and pauses the cache for 5 minutes. */
let pausedUntil = 0
const WAIT = 4000
const limit = <T>(p: Promise<T>, ms = WAIT) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), ms))])
const on = () => useApp.getState().settings.sharedMeta !== false && Date.now() >= pausedUntil
let lastErr = ""
const pause = (e?: unknown) => { pausedUntil = Date.now() + 5 * 60000; lastErr = e instanceof Error ? e.message : "" }
/** A user-started upload retries now instead of waiting out the pause; the last error is kept to say why sharing stopped. */
export const sharedResume = () => { pausedUntil = 0; lastErr = "" }
export const sharedLastError = () => lastErr

export async function sharedGet(key: string, path: string): Promise<J | null> {
  if (!on()) return null
  try {
    const a = await sharedAuth()
    if (!a) return null
    const row = await limit(api.metaGet(a.cfg, a.session, key))
    if (!row || Date.now() - Date.parse(row.fetched_at) > META_TTL) return null // missing or older than the TTL: ask TMDB (and write it back)
    return validShared(path, row.data) ? row.data : null
  } catch (e) { pause(e); return null }
}

/** Sharing is on, signed in, and not paused by a recent failure. */
export async function sharedUsable(): Promise<boolean> { return on() && !!(await sharedAuth()) }

/** Settings > Metadata: rows in the shared table. null = signed out or the table cannot be read right now. */
export async function sharedCounts(): Promise<{ total: number; ids: number } | null> {
  try {
    const a = await sharedAuth()
    return a ? await limit(api.metaCount(a.cfg, a.session)) : null
  } catch { return null }
}

export function sharedPut(key: string, path: string, data: J) {
  if (!on()) return
  void (async () => {
    try {
      const a = await sharedAuth()
      if (a) await limit(api.metaPut(a.cfg, a.session, key, shareBody(path, data)), 15000) // full response, so allow a slower upload; the server keeps a row younger than 7 days as it is
    } catch (e) { pause(e) }
  })()
}
