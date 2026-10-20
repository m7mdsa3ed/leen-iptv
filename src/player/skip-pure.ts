/** Skip intro / credits: where the timings come from. Per kind the first layer wins: the server's own markers (Plex/Jellyfin), marks the user saved for the show,
    markers borrowed from a Plex/Jellyfin copy of the same show, then a fixed "skip 85 s" button early in the episode. Pure (node scripts/skip.check.ts). */
export type PSeg = { kind: "intro" | "recap" | "credits" | "jump"; start: number; end: number }
/** Saved per show (key = groupKey of the show name, so every source's copy shares it): intro start / end in seconds, credits start as seconds BEFORE the end (episodes differ in length). */
export type Mark = { is?: number; ie?: number; ce?: number }

export const JUMP = 85 // the fallback button skips this many seconds...
export const JUMP_FROM = 5, JUMP_TO = 300 // ...and shows between these playhead times

/** The user's saved marks as segments; `dur` = episode length (0 = unknown: credits are skipped until it is). */
export function markSegs(m: Mark | undefined, dur: number): PSeg[] {
  const o: PSeg[] = []
  if (m?.is != null && m.ie != null && m.ie > m.is) o.push({ kind: "intro", start: m.is, end: m.ie })
  if (m?.ce != null && dur > m.ce) o.push({ kind: "credits", start: dur - m.ce, end: dur })
  return o
}

/** Layers in priority order -> one list, one segment per kind; the fallback jump only when no intro is known. */
export function mergeSegs(...layers: PSeg[][]): PSeg[] {
  const seen = new Set<string>(), o: PSeg[] = []
  for (const x of layers.flat()) if (!seen.has(x.kind)) { seen.add(x.kind); o.push(x) }
  return o.some((x) => x.kind === "intro") ? o : [...o, { kind: "jump", start: JUMP_FROM, end: JUMP_TO }]
}

/** Where a press of the button lands. */
export const skipTo = (s: PSeg, now: number) => (s.kind === "jump" ? now + JUMP : s.end)

/** Apply one mark taken at playhead `t`; returns the new mark, or null when it makes no sense (intro end before its start, credits before the halfway point). */
export function setMark(m: Mark | undefined, k: "is" | "ie" | "ce", t: number, dur: number): Mark | null {
  const x = Math.round(t)
  if (k === "is") return { ...m, is: x, ie: m?.ie != null && m.ie > x ? m.ie : undefined }
  if (k === "ie") return m?.is != null && x > m.is ? { ...m, ie: x } : null
  return dur > 0 && x > dur / 2 && x < dur ? { ...m, ce: Math.round(dur - x) } : null
}
