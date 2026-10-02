import { useEffect, useMemo, useState } from "react"
import { askPin } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { srcOfId } from "@/lib/merge-pure"
import { useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"

/** PIN-aware: run fn now, or after the profile PIN when the item's category is locked. */
export function useGuard() {
  const p = useProfile()
  return (i: Item, fn: () => void) => {
    if (p?.pin && p.locked.includes(`${i.kind}|${i.group}`)) void askPin(p.pin).then((ok) => ok && fn())
    else fn()
  }
}

/** Re-render every `ms` (progress bars of the programme that is on now). */
export function useTick(ms: number) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t) }, [ms])
}

/** The series an episode item belongs to (episodes are named by their series and live in the same source). */
export function useSeriesOf(item: Item) {
  const byId = useCatalog((s) => s.byId)
  return useMemo(() => {
    for (const i of byId.values()) if (i.kind === "series" && i.name === item.group && srcOfId(i.id) === srcOfId(item.id)) return i
    return undefined
  }, [byId, item.id, item.group])
}
