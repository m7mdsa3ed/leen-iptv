// Pure notification core (no '@/' imports, no DOM) so `node scripts/notify.check.ts` can run it:
// the inbox (de-dupe by key, 7-day / 50-entry caps), the new-episode diff and the match -> live channel pick.
import { chanKey } from "./logos-pure.ts"

export type NoteKind = "kickoff" | "digest" | "live" | "final" | "episode"
/** Where a row opens: a route name + its id param (`match` id, `player` channel id, `episode` `<seriesId>~<epId>`, `sports`). */
export type NoteRoute = { name: string; id?: string }
export type Note = { key: string; kind: NoteKind; title: string; body?: string; route?: NoteRoute; at: number; read?: boolean }
/** `seen` = every key fired on this device (kept after Clear all, so a cleared alert never fires again). */
export type Inbox = { list: Note[]; seen: Record<string, number> }

export const INBOX_MAX = 50
export const INBOX_DAYS = 7
const DAY = 864e5

/** Drop notes and fired marks older than INBOX_DAYS. */
export function pruneInbox(box: Inbox, now: number): Inbox {
  const old = now - INBOX_DAYS * DAY
  const seen: Record<string, number> = {}
  for (const k in box.seen) if (box.seen[k] > old) seen[k] = box.seen[k]
  return { seen, list: box.list.filter((n) => n.at > old).slice(0, INBOX_MAX) }
}

/** The inbox with `n` on top, or null when its key already fired on this device (a duplicate: show nothing). */
export function addNote(box: Inbox, n: Note): Inbox | null {
  const b = pruneInbox(box, n.at)
  if (b.seen[n.key] != null) return null
  return { seen: { ...b.seen, [n.key]: n.at }, list: [n, ...b.list].slice(0, INBOX_MAX) }
}

export type EpRef = { id: string; season: number; num: number }
/** Per series, device-local: the last episode seen (season, number) and when the list was last fetched. */
export type EpSnap = { s: number; e: number; at: number }
const after = (x: { season: number; num: number }, s: number, e: number) => x.season > s || (x.season === s && x.num > e)

/** Episodes past the stored last one. No snapshot = first look: nothing is new, the last episode becomes the baseline.
 *  The baseline never moves back, so an episode the provider drops for a while is not reported again when it returns. */
export function newEpisodes(prev: EpSnap | undefined, eps: EpRef[], now: number): { fresh: EpRef[]; snap?: EpSnap } {
  let last: EpRef | undefined
  for (const x of eps) if (!last || after(x, last.season, last.num)) last = x
  if (!last) return { fresh: [], snap: prev && { ...prev, at: now } } // empty list (provider hiccup): keep the baseline
  if (!prev) return { fresh: [], snap: { s: last.season, e: last.num, at: now } }
  const fresh = eps.filter((x) => after(x, prev.s, prev.e)).sort((a, b) => a.season - b.season || a.num - b.num)
  return { fresh, snap: fresh.length ? { s: last.season, e: last.num, at: now } : { ...prev, at: now } }
}

/** "Currently watching": series ids with progress in the last `days` (setProgress / pullProgress also stamp the series id). */
export const watchingSeries = (progress: Record<string, { t: number }>, now: number, days = 30): string[] =>
  Object.keys(progress).filter((id) => id.includes("|series|") && now - progress[id].t < days * DAY).sort((a, b) => progress[b].t - progress[a].t)

/** Time to fetch a series' episode list again: never fetched, or 30 min for the one playing, 6 h for the others. */
export const epDue = (snap: EpSnap | undefined, now: number, playing: boolean) => !snap || now - snap.at >= (playing ? 30 : 360) * 60000

/** The live channel showing a match: an exact broadcaster name first, else the first channel whose cleaned name starts with it
 *  (ponytail: name match only, "beIN SPORTS" picks the first beIN channel; a broadcaster -> channel table if it guesses wrong). */
export function channelFor<T extends { name: string }>(tv: string[] | undefined, live: T[]): T | undefined {
  for (const b of tv ?? []) {
    const k = chanKey(b).key
    if (k.length < 3) continue
    const hit = live.find((i) => chanKey(i.name).key === k) ?? live.find((i) => chanKey(i.name).key.startsWith(k))
    if (hit) return hit
  }
  return undefined
}
