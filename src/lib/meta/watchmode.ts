import { fetchT } from "@/lib/net"
import { counted } from "./rate"
import { cached, DAY } from "./cache"
import { norm } from "./title"
import { mapWatchmodeSources, watchmodeRef, watchmodeSearchHit } from "./watchmode-pure"
import type { Avail, ProviderCfg } from "./types"

const BASE = "https://api.watchmode.com/v1"

/** One counted Watchmode GET (key in the X-API-Key header, never in the URL). */
export async function wmGet(path: string, key: string): Promise<unknown> {
  return (await counted("watchmode", () => fetchT(BASE + path, 20000, { headers: { "X-API-Key": key } }))).json()
}

export interface WmTitle { kind: "movie" | "series"; imdb?: string; tmdb?: string; title: string; year?: string }

/** The id Watchmode's title endpoints take: an IMDb / TMDB id we already know (no request), else the best name search hit, remembered for 30 days (null = no hit, re-asked after a day). */
export function watchmodeId(q: WmTitle, key: string): Promise<string | null> {
  const known = watchmodeRef(q.kind, q.imdb, q.tmdb)
  if (known) return Promise.resolve(known)
  return cached(`wm:id:${q.kind}:${norm(q.title)}:${q.year ?? ""}`, 30 * DAY, async () => {
    const u = `/search/?search_field=name&search_value=${encodeURIComponent(q.title)}&types=${q.kind === "series" ? "tv" : "movie"}`
    return watchmodeSearchHit(await wmGet(u, key), q.kind, q.year, q.title)?.id ?? null
  }, (v) => !v)
}

/** Where a title can be watched in the configured country. Availability changes daily, so it has its own short cache (2 days), apart from Meta (30).
    Returns [] (never throws) without a key, when rate limited, offline or the answer has an unexpected shape: Detail simply shows nothing. */
export async function watchmodeAvail(input: WmTitle, cfg: ProviderCfg): Promise<Avail[]> {
  const key = cfg.key?.trim()
  if (!key) return []
  const region = cfg.region?.trim().toUpperCase() || "EG"
  try {
    const id = await watchmodeId(input, key)
    if (!id) return []
    return await cached(`wm:src:${id}:${region}`, 2 * DAY, async () => mapWatchmodeSources(await wmGet(`/title/${id}/sources/?regions=${encodeURIComponent(region)}`, key)), (v) => !v.length)
  } catch {
    return [] // 429, offline, bad key or region: availability is a bonus, never an error on the Detail page
  }
}
