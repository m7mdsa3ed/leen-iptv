import { del, get, keys, set } from "idb-keyval"
import { syncBackend as api } from "@/lib/api"
import { sharedAuth } from "../sync"
import { useApp } from "../store"
import { DAY } from "./cache"
import { isEmptyMeta, validAvail, validPerson, validSeason, validVault, vaultBody, vaultKey } from "./vault-pure"
import type { SeasonRec, PersonRec } from "./vault-pure"
import type { Avail, EpisodeMeta, Meta, PersonInfo, Query } from "./types"

/**
 * The metadata middleman: one merged record per thing looked up, shared by every account.
 *
 * Read order: this device's copy -> the vault (server table meta_vault) -> the providers, whose answers are merged
 * into one record and written back, so the next device (or the next profile) costs nothing.
 *
 * Best effort, never blocking for long: any vault failure (signed out, offline, table not created yet) falls through to
 * the providers and pauses the vault for a few minutes.
 */
const WAIT = 5000
const PAUSE_MS = 5 * 60000
const TTL_DAYS = 30 // a merged record is re-checked after this (META_TTL); a row younger than it is never overwritten
const AVAIL_DAYS = 2 // where-to-watch changes daily, so it is shared on its own short TTL (meta/watchmode.ts uses 2 days)

let pausedUntil = 0
const pause = () => { pausedUntil = Date.now() + PAUSE_MS }
const on = () => useApp.getState().settings.sharedMeta !== false && Date.now() >= pausedUntil

const limit = <T>(p: Promise<T>, ms = WAIT) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), ms))])

/** This device's copy of a vault answer, so the same record is not re-read from the server on every screen. */
const memKey = (key: string) => `vault:${key}`

/**
 * One record: this device's copy when it is fresh, else the row, else null (the caller asks the providers).
 * `valid` distrusts the stored shape, `ttl` is how long a row stays good, `mem` how long this device keeps its copy.
 */
async function read<T>(key: string, ttlDays: number, memHours: number, valid: (j: unknown) => j is T): Promise<T | null> {
  const local = await get<{ at: number; m: T }>(memKey(key)).catch(() => undefined)
  if (local && Date.now() - local.at < memHours * 3600e3 && valid(local.m)) return local.m
  if (!on()) return null
  try {
    const a = await sharedAuth()
    if (!a) return null
    const row = await limit(api.vaultGet(a.cfg, a.session, key))
    if (!row || Date.now() - Date.parse(row.fetched_at) > ttlDays * DAY || !valid(row.data)) return null
    void set(memKey(key), { at: Date.now(), m: row.data }).catch(() => {})
    return row.data
  } catch { pause(); return null }
}

/** Store a record for everyone. Called only after a real provider call, so the vault is a set of answers somebody produced. */
function write(key: string, data: unknown, ttlDays: number) {
  if (!on()) return
  void (async () => {
    try {
      const a = await sharedAuth()
      if (!a) return
      await limit(api.vaultPut(a.cfg, a.session, key, data, ttlDays), 15000)
      void set(memKey(key), { at: Date.now(), m: data }).catch(() => {}) // this device reads it back from disk, not the server
    } catch { pause() }
  })()
}

/** A title's merged record, or null when the vault cannot answer (then the caller asks the providers). */
export const vaultGet = (q: Query, lang: string | undefined) => read<Meta>(vaultKey(q, lang), TTL_DAYS, 6, validVault)
/** Store a merged title. `force` (Refresh metadata) replaces the row now instead of waiting out its TTL. Nothing found is never stored. */
export function vaultPut(q: Query, lang: string | undefined, m: Meta, force = false) {
  if (isEmptyMeta(m)) return
  write(vaultKey(q, lang), vaultBody(m), force ? 0 : TTL_DAYS)
}

/** One season's episodes. `id` is the provider's own series id (the same one `useSeasonMeta` asks with). */
export const seasonGet = (key: string) => read<SeasonRec>(key, TTL_DAYS, 6, validSeason)
/** `force` = a season still airing: its row is replaced now, so new episodes and dates show up for everyone. */
export function seasonPut(key: string, eps: EpisodeMeta[], force = false) {
  if (eps.length) write(key, { eps: eps.slice(0, 100) }, force ? 0 : TTL_DAYS)
}

/** A person's profile. */
export const personGet = (key: string) => read<PersonRec>(key, TTL_DAYS, 6, validPerson)
export function personPut(key: string, info: PersonInfo) {
  write(key, { info: trimPerson(info) }, TTL_DAYS)
}

/** Where a title can be watched in one region. An empty list is a real answer (not streaming there) and is kept for the short TTL. */
export const availGet = (key: string) => read<{ avail: Avail[] }>(key, AVAIL_DAYS, 2, validAvail)
export const availPut = (key: string, avail: Avail[]) => write(key, { avail: avail.slice(0, 40) }, AVAIL_DAYS)

/** A person record is trimmed like a Meta row: the profile, not every credit a provider listed. */
function trimPerson(p: PersonInfo): PersonInfo {
  const out: PersonInfo = { ...p, aka: (p.aka ?? []).slice(0, 4), credits: (p.credits ?? []).slice(0, 120) }
  for (const k of Object.keys(out) as (keyof PersonInfo)[]) if (out[k] === undefined || out[k] === "") delete out[k]
  if (!out.aka) out.aka = []
  if (!out.credits) out.credits = []
  return out
}

/** Refresh metadata: drop this device's copies of the vault rows, so the title is read from the server (and re-merged) again. */
export async function forgetVault() {
  const ks = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith("vault:"))
  await Promise.all(ks.map((k) => del(k))).catch(() => {})
}

/** Settings > Metadata: how many records the vault holds for everyone. null = signed out / not reachable. */
export async function vaultCounts(): Promise<number | null> {
  try {
    const a = await sharedAuth()
    return a ? await limit(api.vaultCount(a.cfg, a.session)) : null
  } catch { return null }
}
