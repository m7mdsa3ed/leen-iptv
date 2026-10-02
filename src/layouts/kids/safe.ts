import { findLock } from "@/lib/merge-pure"
import { useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"

// ponytail: best-effort name heuristic, not a real content rating; add words (or a rating source) if it misses things.
const BAD = /\b(adults?|xxx|porn\w*|sex\w*|erotic\w*|horror)\b|18\s*\+|\+\s*18|للكبار|اباحي|إباحي|جنس/i
export const looksAdult = (s: string) => BAD.test(s)

/** Allowed-content tests for the current profile: not locked (category lock), no adult-looking name. */
export function useSafe() {
  const locked = useProfile()?.locked ?? []
  const group = (kind: string, g: string) => !looksAdult(g) && !findLock(locked, kind, g)
  return { group, item: (i: Item) => group(i.kind, i.group) && !looksAdult(i.name) }
}
