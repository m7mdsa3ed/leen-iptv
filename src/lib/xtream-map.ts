// Xtream API answer -> catalog items. Pure, so the parse worker (xtream.worker.ts) can run it off the main thread.
import type { Item } from "./types.ts"
import { day } from "./browse-pure.ts"

type R = Record<string, string | number | undefined>
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

/** One part of the catalog (live channels, movies or series) from its category list and stream list. */
export function mapXtream(sourceId: string, kind: "live" | "movie" | "series", cats: unknown, list: unknown): Item[] {
  const names = new Map(arr<R>(cats).map((x) => [String(x.category_id), String(x.category_name)]))
  const out: Item[] = []
  for (const x of arr<R>(list)) {
    const sid = String(kind === "series" ? x.series_id : x.stream_id)
    // only the fields a row has: explicit undefined keys cost memory and clone/merge time on 100k-item panels
    const i: Item = { id: `${sourceId}|${kind}|${sid}`, kind, sid, name: String(x.name ?? "?"), group: names.get(String(x.category_id)) ?? "Other" }
    const logo = String((kind === "series" ? x.cover : x.stream_icon) ?? "")
    if (logo) i.logo = logo
    if (x.epg_channel_id) i.epgId = String(x.epg_channel_id)
    if (x.container_extension) i.ext = String(x.container_extension)
    if (x.num) i.num = Number(x.num)
    if (x.rating) i.rating = String(x.rating)
    const year = String(x.year ?? x.releaseDate ?? x.release_date ?? "").match(/^(?:19|20)\d{2}/)?.[0] // "2023" or "2023-05-01"
    if (year !== undefined) i.year = year
    const released = day(x.releaseDate ?? x.release_date)
    if (released !== undefined) i.released = released
    const added = Number(kind === "series" ? x.last_modified : x.added) // series: last update = newest episode
    if (added) i.added = added
    if (x.plot) i.plot = String(x.plot)
    out.push(i)
  }
  return out
}
