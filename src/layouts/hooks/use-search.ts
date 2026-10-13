import { useDeferredValue, useMemo } from "react"
import { create } from "zustand"
import { useOpen } from "@/components/tv/ui"
import { fold } from "@/lib/i18n"
import { useSearchHistory } from "@/lib/search-history"
import type { Item } from "@/lib/types"
import { useCatalogView } from "./use-source-filter"

/**
 * Search state. Returns {
 *  q, setQ (raw input), query (trimmed lowercase deferred), tooShort (query < 2 chars), results (<=300), live, movies, series (results by kind),
 *  open(item, from?) (PIN-aware; live items zap within `from`)
 * }
 */
/** ponytail: the query lives outside the palette, so closing it to open a title and searching again shows the same results */
const useQ = create<{ q: string }>(() => ({ q: "" }))
const setQ = (q: string) => useQ.setState({ q })

export function useSearch() {
  const { items } = useCatalogView()
  const open = useOpen()
  const q = useQ((s) => s.q)
  const query = fold(useDeferredValue(q).trim())
  const results = useMemo(() => (query.length < 2 ? [] : items.filter((i) => fold(i.name).includes(query) || (!!i.srcName && fold(i.srcName).includes(query))).slice(0, 300)), [query, items])
  const live = useMemo(() => results.filter((i) => i.kind === "live"), [results])
  const movies = useMemo(() => results.filter((i) => i.kind === "movie"), [results])
  const series = useMemo(() => results.filter((i) => i.kind === "series"), [results])
  return { q, setQ, query, tooShort: query.length < 2, results, live, movies, series, open: (i: Item, from?: Item[]) => { useSearchHistory.getState().add(q); return open(i, from?.filter((x) => x.kind === "live")) } }
}
