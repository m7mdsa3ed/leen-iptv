import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { askPin, useOpen } from "@/components/tv/ui"
import { catsOf, findLock } from "@/lib/merge-pure"
import { fold, useLang, useT } from "@/lib/i18n"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { usePData, useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"
import { byName, foldedName, sortList, yearNum, type Sort } from "@/lib/browse-pure"
import { useCatalogView } from "./use-source-filter"

export { byName, type Sort }
export const SORTS: Sort[] = ["default", "added", "year", "rating", "az"]
/** Sorts this list can offer: Top rated / Newest / Recently added only when some title has a rating / a year / an added date. */
export const sortsFor = (l: Item[], t: (k: string) => string) => {
  const has = { rating: l.some((i) => parseFloat(i.rating ?? "") > 0), year: l.some((i) => yearNum(i) > 0), added: l.some((i) => !!i.added) }
  return SORTS.filter((s) => (s !== "rating" && s !== "year" && s !== "added") || has[s]).map((s): [Sort, string] => [s, t(`hooks.sort.${s}`)])
}
/** Progress percent of an item, undefined when never played. */
export const pctOf = (progress: Record<string, { pos: number; dur: number } | undefined>, i: Item) => { const p = progress[i.id]; return p && (p.pos / p.dur) * 100 }
/** A stable callback (same function every render) that always runs the latest `f`: lets cards/chips stay memoised while `f` closes over fresh state. */
export function useStable<A extends unknown[], R>(f: (...a: A) => R): (...a: A) => R {
  const ref = useRef(f)
  useEffect(() => { ref.current = f })
  return useCallback((...a: A) => ref.current(...a), [])
}

/**
 * One category page (route id `${kind}|${category}`), incl. the PIN gate (Back if refused).
 * Returns { kind, group, status, ok (false while the PIN is pending: render nothing), all (every title), items (filtered + sorted),
 *  sort, setSort, sorts ([Sort,label][] available), q, setQ (title filter), pct(item), open(item), back() }
 */
export function useCategory(id: string) {
  const cut = id.indexOf("|")
  const kind = (id.slice(0, cut) === "series" ? "series" : "movie") as "movie" | "series"
  const group = id.slice(cut + 1)
  const status = useCatalog((s) => s.status)
  const { byKind } = useCatalogView()
  const t = useT()
  const { lang } = useLang()
  const progress = usePData().progress
  const p = useProfile()
  const back = useRoute((s) => s.back)
  const open = useOpen()
  const locked = !!p?.pin && !!findLock(p.locked, kind, group)
  const [ok, setOk] = useState(!locked) // locked categories need the PIN even when reached by URL or refresh
  const [sort, setSort] = useState<Sort>("added")
  const [q, setQ] = useState("")
  useEffect(() => {
    if (ok || !p?.pin) return
    void askPin(p.pin).then((good) => (good ? setOk(true) : back()))
  }, [ok, p?.pin, back])
  const all = useMemo(() => byKind[kind].filter((i) => catsOf(i).includes(group)), [byKind, kind, group])
  const sorts = useMemo(() => sortsFor(all, t), [all, t])
  // sort once per order; a query only filters the sorted list (a stable sort, so the order equals sorting the filtered list)
  const sorted = useMemo(() => sortList(all, sort, lang), [all, sort, lang])
  const f = fold(useDeferredValue(q).trim())
  const items = useMemo(() => (f ? sorted.filter((i) => foldedName(i).includes(f)) : sorted), [sorted, f])
  const pct = useCallback((i: Item) => pctOf(progress, i), [progress])
  return {
    kind, group, status, ok, all, items, sort, setSort, sorts, q, setQ, back,
    pct,
    open: useStable((i: Item) => open(i)),
  }
}
