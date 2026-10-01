import { useDeferredValue, useMemo, useState } from "react"
import { useOpen } from "@/components/tv/ui"
import type { Item } from "@/lib/types"
import { useCatalogView } from "./use-source-filter"

/**
 * Search state. Returns {
 *  q, setQ (raw input), query (trimmed lowercase deferred), tooShort (query < 2 chars), results (<=300), live, movies, series (results by kind),
 *  open(item, from?) (PIN-aware; live items zap within `from`)
 * }
 */
export function useSearch() {
  const { items } = useCatalogView()
  const open = useOpen()
  const [q, setQ] = useState("")
  const query = useDeferredValue(q).trim().toLowerCase()
  const results = useMemo(() => (query.length < 2 ? [] : items.filter((i) => i.name.toLowerCase().includes(query)).slice(0, 300)), [query, items])
  const live = useMemo(() => results.filter((i) => i.kind === "live"), [results])
  const movies = useMemo(() => results.filter((i) => i.kind === "movie"), [results])
  const series = useMemo(() => results.filter((i) => i.kind === "series"), [results])
  return { q, setQ, query, tooShort: query.length < 2, results, live, movies, series, open: (i: Item, from?: Item[]) => open(i, from?.filter((x) => x.kind === "live")) }
}
