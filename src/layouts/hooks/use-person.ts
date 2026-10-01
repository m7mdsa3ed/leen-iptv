import { useMemo } from "react"
import { useOpen } from "@/components/tv/ui"
import { useCatalogView } from "./use-source-filter"
import { findInCatalog, usePerson } from "@/lib/meta"
import type { Credit } from "@/lib/meta/types"
import { useRoute } from "@/lib/nav"
import type { Item } from "@/lib/types"

/**
 * Cast/crew profile (route params id = TMDB id or name, name optional).
 * Returns { name (display), info (PersonInfo|null: photo, bio, birthday, ...), loading, error, available (TMDB key set),
 *  library: {item, credit}[] (credits found in the catalog, <=30), known (<=20 credits), filmography (<=60, newest first),
 *  match(credit) -> catalog Item|undefined, pseudo(credit) -> Item for rendering a credit as a card, openCredit(credit) (opens it if in the catalog),
 *  open(item), openSettings(), back() }
 */
export function usePersonPage(id?: string, name?: string) {
  const ref = useMemo(() => {
    const numeric = !!id && /^\d+$/.test(id)
    return { id: numeric ? id : undefined, name: name ?? (numeric ? "" : id ?? "") }
  }, [id, name])
  const { info, loading, error, available } = usePerson(ref)
  const { byKind } = useCatalogView()
  const open = useOpen()
  const back = useRoute((s) => s.back)
  const go = useRoute((s) => s.go)
  const match = (c: Credit) => findInCatalog(byKind, c.kind, c.title, c.year)
  const library = useMemo(() => {
    const out: { item: Item; credit: Credit }[] = []
    for (const c of info?.credits ?? []) {
      const item = findInCatalog(byKind, c.kind, c.title, c.year)
      if (item && !out.some((o) => o.item.id === item.id)) out.push({ item, credit: c })
    }
    return out.slice(0, 30)
  }, [info, byKind])
  const filmography = useMemo(() => [...(info?.credits ?? [])].sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0)).slice(0, 60), [info])
  return {
    name: info?.name || ref.name, info, loading, error, available, library, known: (info?.credits ?? []).slice(0, 20), filmography, match,
    pseudo: (c: Credit): Item => ({ id: `tmdb|${c.id}`, kind: c.kind, name: c.title, group: "", logo: c.poster }),
    openCredit: (c: Credit) => { const m = match(c); if (m) void open(m) },
    open: (i: Item) => open(i), openSettings: () => go("settings"), back,
  }
}
