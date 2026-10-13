import { useApp } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import { catsOf, findLock, srcOfId } from "@/lib/merge-pure"
import { epDue, newEpisodes, watchingSeries, type EpSnap } from "@/lib/notify-pure"
import { notify, notifyOn } from "@/lib/notify"
import { seriesInfo } from "@/lib/xtream"
import { plexDetail } from "@/lib/plex"
import { jellyfinDetail } from "@/lib/jellyfin"
import { usePlayerHost } from "@/player/host"
import { fmt, t } from "@/lib/i18n"
import type { Episode, Item, Source } from "@/lib/types"

/* Last episode seen per series, device-local (each device reports a new episode once). */
const KEY = "leen-ep-snap"
let snaps: Record<string, EpSnap> | null = null
const load = () => {
  if (!snaps) { try { snaps = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, EpSnap> } catch { snaps = {} } }
  return snaps
}
const save = (now: number) => {
  const s = load()
  for (const k in s) if (now - s[k].at > 60 * 864e5) delete s[k] // shows not checked for 60 days
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

const episodesOf = (src: Source, proxy: string, item: Item): Promise<Episode[]> =>
  src.type === "plex" ? plexDetail(src, proxy, item).then((r) => r.episodes)
  : src.type === "jellyfin" ? jellyfinDetail(src, proxy, item).then((r) => r.episodes)
  : src.type === "xtream" && item.sid ? seriesInfo(src, proxy, item).then((r) => r.episodes)
  : Promise.resolve([]) // M3U has no episode lists

/** A playing series' new episodes go to the player's queue, so the Next card / auto-play picks them up. */
export type NewEpisodesEvent = CustomEvent<{ series: string; items: Item[] }>

let busy = false
/** One pass over the shows the profile is watching (and the one playing): fetch the due ones, one at a time, and report new episodes. */
export async function episodeTick() {
  if (busy || !notifyOn("episode") || !navigator.onLine) return
  const s = useApp.getState()
  const cat = useCatalog.getState()
  if (!s.profileId || cat.status !== "ready") return
  busy = true
  try {
    const now = Date.now()
    const cur = usePlayerHost.getState().cur
    const playing = cur?.queue[cur.index]?.series
    const ids = watchingSeries(s.data[s.profileId]?.progress ?? {}, now)
    if (playing && !ids.includes(playing)) ids.unshift(playing)
    const p = s.profiles.find((x) => x.id === s.profileId)
    const snap = load()
    for (const id of ids) { // ponytail: a pool of 1; watched shows only, never the whole catalog
      const item = cat.byId.get(id)
      const src = s.sources.find((x) => x.id === srcOfId(id))
      if (!item || item.kind !== "series" || !src || src.type === "m3u" || !epDue(snap[id], now, id === playing)) continue
      if (p?.pin && catsOf(item).some((c) => findLock(p.locked, "series", c))) continue
      const eps = await episodesOf(src, s.settings.proxy, item).catch(() => null)
      if (!eps) continue
      const r = newEpisodes(snap[id], eps.map((e) => ({ id: e.item.id, season: e.season, num: e.num })), Date.now())
      if (r.snap) snap[id] = r.snap
      if (!r.fresh.length) continue
      const first = r.fresh[0], last = r.fresh[r.fresh.length - 1]
      const se = t("pages.episode.code", { s: fmt.number(first.season), e: fmt.number(first.num) })
      notify(r.fresh.length > 1 ? fmt.plural("pages.episode.newMany", r.fresh.length, { show: item.name }) : t("pages.episode.new", { show: item.name }), se,
        { kind: "episode", key: `ep:${last.id}`, route: { name: "episode", id: `${id}~${first.id}` } })
      const fresh = new Set(r.fresh.map((e) => e.id))
      window.dispatchEvent(new CustomEvent("leen:episodes", { detail: { series: id, items: eps.filter((e) => fresh.has(e.item.id)).map((e) => e.item) } }))
    }
  } finally { save(Date.now()); busy = false }
}

let started = false
/** Check a minute after start, then every 5 min (each show is only fetched when due: 30 min playing, 6 h otherwise). */
export function startEpisodeWatch() {
  if (started) return
  started = true
  const loop = () => { void episodeTick(); window.setTimeout(loop, 5 * 60000) }
  window.setTimeout(loop, 60000)
}
