// Online subtitles: SubDL + OpenSubtitles search and download (pure parts in subs-pure.ts). Keys live in settings.subs (synced).
import { HttpError, plexFetch } from "./net"
import { t } from "./i18n"
import { useApp } from "./store"
import { matchKey, titleMeta } from "./meta"
import { cleanTitle, matchId, tmdbId } from "./meta/title"
import type { Item } from "./types"
import {
  decodeSub, episodeOf, gzipWrap, mapOs, mapSubdl, mergeHits, osSearchUrl, pickEntry, readZip, subdlFileUrl, subdlSearchUrl, toWebVtt,
  type SubHit, type SubProvider, type SubQuery,
} from "./subs-pure.ts"

const OS_API = "https://api.opensubtitles.com/api/v1"
const OS_HEAD = (key: string) => ({ "Api-Key": key, "X-User-Agent": "LeenTV v1.0", Accept: "application/json" }) // browsers cannot set User-Agent; OpenSubtitles reads X-User-Agent
const cfg = () => useApp.getState().settings.subs ?? {}
const get = (url: string, init?: RequestInit) => plexFetch(url, useApp.getState().settings.proxy, init, 20000) // direct first, then the CORS proxy
/** Plain words for the provider answers people actually hit: a wrong key (401/403) and the daily download quota (406/429). */
const why = (e: unknown) =>
  e instanceof HttpError && (e.status === 401 || e.status === 403) ? t("player.subKeyBad")
  : e instanceof HttpError && (e.status === 406 || e.status === 429) ? t("player.subQuota")
  : e instanceof Error ? e.message : String(e)

/** Ids for the search: a manual match wins, then the metadata lookup; episodes search with their series' ids + SxxEyy. */
export async function subQuery(item: Item, byId: Map<string, Item>): Promise<SubQuery> {
  const ep = episodeOf(item.name)
  const title = item.series ? byId.get(item.series) ?? { ...item, kind: "series" as const, name: item.group } : item
  const ct = cleanTitle(title.srcName ?? title.name)
  const q: SubQuery = { kind: ep || item.series ? "series" : "movie", title: ct.title, year: ct.year, ...(ep ? { season: ep.season, episode: ep.episode } : {}) }
  const s = useApp.getState().settings
  const manual = tmdbId(matchId(s.metaMatch?.[matchKey(title)]))
  if (manual) return { ...q, tmdb: manual }
  try {
    const m = await titleMeta(title, s.meta ?? [])
    return { ...q, tmdb: tmdbId(m.ids?.tmdb), imdb: m.ids?.imdb }
  } catch { return q } // no metadata provider / offline: search by title
}

/** Both providers in parallel. A provider without a key is skipped; its error comes back next to the hits of the other one. */
export async function searchSubs(q: SubQuery, lang: string): Promise<{ hits: SubHit[]; errors: { provider: SubProvider; msg: string }[]; keyless: boolean }> {
  const c = cfg()
  const errors: { provider: SubProvider; msg: string }[] = []
  const run = async (provider: SubProvider, f: () => Promise<SubHit[]>) => { try { return await f() } catch (e) { errors.push({ provider, msg: why(e) }); return [] } }
  const lists = await Promise.all([
    c.os ? run("opensubtitles", async () => mapOs(await (await get(osSearchUrl(q, lang), { headers: OS_HEAD(c.os!) })).json())) : [],
    c.subdl ? run("subdl", async () => mapSubdl(await (await get(subdlSearchUrl(q, lang, c.subdl!))).json(), lang, q)) : [],
  ])
  return { hits: mergeHits(lists), errors, keyless: !c.os && !c.subdl }
}

async function inflate(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b.slice()]).stream().pipeThrough(new DecompressionStream("gzip"))
  return new Uint8Array(await new Response(s).arrayBuffer())
}

/** The chosen hit as WebVTT text (zip unpacked, encoding fixed, SRT/ASS converted). */
const got = new Map<string, string>() // this session's downloads: reopening a title does not spend another download
export async function downloadSub(hit: SubHit, q: SubQuery): Promise<string> {
  const k = `${hit.provider}|${hit.ref}|${q.season ?? ""}|${q.episode ?? ""}`
  const hitText = got.get(k)
  if (hitText) return hitText
  try { const v = await fetchSub(hit, q); got.set(k, v); return v } catch (e) { throw new Error(why(e)) }
}
async function fetchSub(hit: SubHit, q: SubQuery): Promise<string> {
  const c = cfg()
  let name = hit.name, bytes: Uint8Array
  if (hit.provider === "opensubtitles") {
    const r = await (await get(`${OS_API}/download`, { method: "POST", headers: { ...OS_HEAD(c.os ?? ""), "Content-Type": "application/json" }, body: JSON.stringify({ file_id: Number(hit.ref) }) })).json()
    if (!r?.link) throw new Error(String(r?.message ?? "OpenSubtitles: no download link"))
    name = String(r.file_name ?? "sub.srt")
    bytes = new Uint8Array(await (await get(String(r.link))).arrayBuffer())
  } else {
    const zip = new Uint8Array(await (await get(subdlFileUrl(hit.ref))).arrayBuffer())
    const e = pickEntry(readZip(zip), q.season !== undefined && q.episode !== undefined ? { season: q.season, episode: q.episode } : undefined)
    if (!e) throw new Error("SubDL: no subtitle file in the archive")
    name = e.name
    bytes = e.method === 0 ? e.data : e.method === 8 ? await inflate(gzipWrap(e)) : (() => { throw new Error("SubDL: unsupported archive") })()
  }
  const vtt = toWebVtt(name, decodeSub(bytes, hit.lang))
  if (!vtt.includes("-->")) throw new Error("not a subtitle file")
  return vtt
}
