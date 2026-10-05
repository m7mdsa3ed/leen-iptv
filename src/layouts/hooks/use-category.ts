import { useEffect, useMemo, useState } from "react"
import { askPin, useOpen } from "@/components/tv/ui"
import { findLock } from "@/lib/merge-pure"
import { LOCALE, fold, useLang, useT, type Lang } from "@/lib/i18n"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { usePData, useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"
import { byAdded, byRelease, yearNum } from "@/lib/browse-pure"
import { useCatalogView } from "./use-source-filter"

export type Sort = "default" | "az" | "rating" | "year" | "added"
export const SORTS: Sort[] = ["default", "added", "year", "rating", "az"]
/** Sorts this list can offer: Top rated / Newest / Recently added only when some title has a rating / a year / an added date. */
export const sortsFor = (l: Item[], t: (k: string) => string) => {
  const has = { rating: l.some((i) => parseFloat(i.rating ?? "") > 0), year: l.some((i) => yearNum(i) > 0), added: l.some((i) => !!i.added) }
  return SORTS.filter((s) => (s !== "rating" && s !== "year" && s !== "added") || has[s]).map((s): [Sort, string] => [s, t(`hooks.sort.${s}`)])
}
/** A-Z title compare for the app language. One Collator per sort: localeCompare with options builds a new one per call (~40x slower on big catalogs). */
export const byName = (lang: Lang) => { const c = new Intl.Collator(LOCALE[lang], { numeric: true, sensitivity: "base" }).compare; return (a: Item, b: Item) => c(a.name, b.name) }

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
  const d = usePData()
  const p = useProfile()
  const back = useRoute((s) => s.back)
  const open = useOpen()
  const locked = !!p?.pin && !!findLock(p.locked, kind, group)
  const [ok, setOk] = useState(!locked) // locked categories need the PIN even when reached by URL or refresh
  const [sort, setSort] = useState<Sort>("default")
  const [q, setQ] = useState("")
  useEffect(() => {
    if (ok || !p?.pin) return
    void askPin(p.pin).then((good) => (good ? setOk(true) : back()))
  }, [ok, p?.pin, back])
  const all = useMemo(() => byKind[kind].filter((i) => i.group === group), [byKind, kind, group])
  const sorts = useMemo(() => sortsFor(all, t), [all, t])
  const items = useMemo(() => {
    const f = fold(q.trim())
    const l = f ? all.filter((i) => fold(i.name).includes(f)) : all
    if (sort === "az") return [...l].sort(byName(lang))
    if (sort === "rating") return [...l].sort((a, b) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0))
    if (sort === "year") return [...l].sort(byRelease)
    if (sort === "added") return [...l].sort(byAdded)
    return l
  }, [all, q, sort, lang])
  return {
    kind, group, status, ok, all, items, sort, setSort, sorts, q, setQ, back,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    open: (i: Item) => open(i),
  }
}
