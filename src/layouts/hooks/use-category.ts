import { useEffect, useMemo, useState } from "react"
import { askPin, useOpen } from "@/components/tv/ui"
import { findLock } from "@/lib/merge-pure"
import { LOCALE, fold, useLang, useT } from "@/lib/i18n"
import { useCatalog } from "@/lib/catalog"
import { useRoute } from "@/lib/nav"
import { usePData, useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"
import { useCatalogView } from "./use-source-filter"

export type Sort = "default" | "az" | "rating"
const SORTS: Sort[] = ["default", "az", "rating"]

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
  const hasRating = useMemo(() => all.some((i) => parseFloat(i.rating ?? "") > 0), [all])
  const items = useMemo(() => {
    const f = fold(q.trim())
    const l = f ? all.filter((i) => fold(i.name).includes(f)) : all
    if (sort === "az") return [...l].sort((a, b) => a.name.localeCompare(b.name, LOCALE[lang], { numeric: true, sensitivity: "base" }))
    if (sort === "rating") return [...l].sort((a, b) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0))
    return l
  }, [all, q, sort, lang])
  return {
    kind, group, status, ok, all, items, sort, setSort, sorts: SORTS.filter((s) => s !== "rating" || hasRating).map((s): [Sort, string] => [s, t(`hooks.sort.${s}`)]), q, setQ, back,
    pct: (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100,
    open: (i: Item) => open(i),
  }
}
