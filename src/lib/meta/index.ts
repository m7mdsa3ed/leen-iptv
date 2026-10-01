import { useEffect, useMemo, useState } from "react"
import { get, set } from "idb-keyval"
import { useApp } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import type { Item } from "@/lib/types"
import { DEFAULT_CFG, PROVIDERS } from "./providers"
import { cleanTitle, norm } from "./title"
import type { Ids, Meta, PersonInfo, PersonRef, Provider, ProviderCfg, Query, SimilarRef } from "./types"

const WEEK = 7 * 864e5

/** Saved config merged with the registry: unknown ids dropped, new providers appended (disabled). */
export function normalizeCfg(saved: ProviderCfg[] | undefined): ProviderCfg[] {
  const out = (saved ?? DEFAULT_CFG).filter((c) => PROVIDERS.some((p) => p.id === c.id))
  for (const p of PROVIDERS) if (!out.some((c) => c.id === p.id)) out.push({ id: p.id, enabled: false })
  return out
}

const emptyMeta = (): Meta => ({ genres: [], ratings: [], cast: [], directors: [], similar: [], ids: {} })

/** Run providers in priority order; the first non-empty value per field wins, ratings from all are kept. Ids found early feed later providers. */
export async function loadMeta(q: Query, cfgs: ProviderCfg[]): Promise<Meta> {
  const m = emptyMeta()
  const ids: Ids = { ...q.ids }
  for (const c of cfgs) {
    const p: Provider | undefined = PROVIDERS.find((x) => x.id === c.id)
    if (!p || !c.enabled) continue
    let r
    try { r = await p.fetch({ ...q, ids }, c) } catch { continue } // one broken provider must not hide the others
    if (!r) continue
    for (const k of ["title", "year", "plot", "runtime", "poster", "backdrop"] as const) m[k] ||= r[k]
    for (const k of ["genres", "directors", "similar"] as const) if (!m[k].length && r[k]?.length) (m[k] as unknown[]) = r[k]!
    // cast: names-only lists (Xtream, OMDb) give way to a list that has photos
    if (r.cast?.length && (!m.cast.length || (!m.cast.some((c) => c.photo) && r.cast.some((c) => c.photo)))) m.cast = r.cast
    for (const x of r.ratings ?? []) if (!m.ratings.some((y) => y.source === x.source)) m.ratings.push(x)
    ids.tmdb ||= r.ids?.tmdb
    ids.imdb ||= r.ids?.imdb
  }
  m.ids = ids
  return m
}

/** Source data (e.g. Plex, Jellyfin) beats providers: `base` wins per field, providers only fill gaps. */
function withBase(m: Meta, b?: Partial<Meta>): Meta {
  if (!b) return m
  const r = { ...m }
  for (const k of ["title", "year", "plot", "runtime", "poster", "backdrop"] as const) r[k] = b[k] || m[k]
  for (const k of ["genres", "directors", "similar"] as const) (r[k] as unknown[]) = b[k]?.length ? b[k]! : m[k]
  r.cast = b.cast?.length && (b.cast.some((c) => c.photo) || !m.cast.some((c) => c.photo)) ? b.cast : m.cast
  r.ratings = [...(b.ratings ?? []), ...m.ratings.filter((x) => !b.ratings?.some((y) => y.source === x.source))]
  r.ids = { ...m.ids, ...b.ids }
  return r
}

/** Details for a movie/series, cached for a week. `ready` = the Xtream info has been fetched (or will not be). */
export function useMeta(item: Item | undefined, xtream: Record<string, unknown> | undefined, ready: boolean, base?: Partial<Meta>) {
  const saved = useApp((s) => s.settings.meta)
  const cfgs = useMemo(() => normalizeCfg(saved), [saved])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)
  const online = cfgs.some((c) => c.enabled && c.id !== "xtream" && (c.key || !PROVIDERS.find((p) => p.id === c.id)?.needsKey))
  const sig = cfgs.filter((c) => c.enabled).map((c) => `${c.id}:${c.key ? 1 : 0}:${c.lang ?? ""}`).join(",")

  useEffect(() => {
    if (!item || !ready || item.kind === "live") return
    let live = true
    setMeta(null)
    const ct = cleanTitle(item.name)
    const q: Query = { kind: item.kind === "series" ? "series" : "movie", title: ct.title, year: ct.year, ids: {}, xtream }
    const key = `meta:${item.id}:${sig}`
    ;(async () => {
      setLoading(true)
      const c = online ? await get<{ at: number; m: Meta }>(key) : undefined
      if (c && Date.now() - c.at < (c.m.plot || c.m.cast.length ? WEEK : 864e5)) return live && void setMeta(withBase(c.m, base))
      const m = await loadMeta(q, cfgs)
      if (online) void set(key, { at: Date.now(), m }) // cached without `base`: source data is merged fresh each time
      if (live) setMeta(withBase(m, base))
    })().finally(() => live && setLoading(false))
    return () => { live = false }
  }, [item, xtream, ready, sig, base]) // eslint-disable-line react-hooks/exhaustive-deps

  return { meta, loading, online }
}

/* ---------- "More like this", only titles that exist in the user's catalog ---------- */
const idx = new WeakMap<Item[], Map<string, Item[]>>()
const index = (items: Item[]) => {
  let m = idx.get(items)
  if (!m) {
    m = new Map()
    for (const i of items) { const k = norm(i.name); const l = m.get(k); l ? l.push(i) : m.set(k, [i]) }
    idx.set(items, m)
  }
  return m
}

/** A title from a provider that also exists in the user's catalog (same cleaned title; year breaks ties). */
export function findInCatalog(byKind: Record<string, Item[]>, kind: Item["kind"], title: string, year?: string, excludeId?: string, alt?: string): Item | undefined {
  const m = index(byKind[kind])
  const c = (m.get(norm(title)) ?? (alt ? m.get(norm(alt)) : undefined) ?? []).filter((i) => i.id !== excludeId)
  return (year && c.find((i) => i.name.includes(year))) || c[0]
}

export function useSimilar(item: Item | undefined, meta: Meta | null): Item[] {
  const byKind = useCatalog((s) => s.byKind)
  return useMemo(() => {
    if (!item || !meta?.similar.length) return []
    const out: Item[] = []
    for (const s of meta.similar) {
      const pick = findInCatalog(byKind, item.kind, s.title, s.year, item.id, s.alt)
      if (pick && !out.includes(pick)) out.push(pick)
    }
    return out
  }, [item, meta, byKind])
}

/* ---------- person profiles ---------- */
/** First enabled provider that can describe this person wins. Cached for 30 days. */
export function usePerson(ref: PersonRef) {
  const saved = useApp((s) => s.settings.meta)
  const cfgs = useMemo(() => normalizeCfg(saved), [saved])
  const usable = cfgs.filter((c) => c.enabled && c.key && PROVIDERS.find((p) => p.id === c.id)?.person)
  const sig = usable.map((c) => `${c.id}:${c.lang ?? ""}`).join(",")
  const [info, setInfo] = useState<PersonInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!usable.length) return
    let live = true
    setInfo(null); setError("")
    const key = `person:${ref.id ?? ref.name}:${sig}`
    ;(async () => {
      setLoading(true)
      const c = await get<{ at: number; p: PersonInfo }>(key)
      if (c && Date.now() - c.at < 30 * 864e5) return live && void setInfo(c.p)
      for (const cfg of usable) {
        const p = await PROVIDERS.find((x) => x.id === cfg.id)!.person!(ref, cfg)
        if (p) { void set(key, { at: Date.now(), p }); return live && void setInfo(p) }
      }
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e))).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [ref.id, ref.name, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  return { info, loading, error, available: usable.length > 0 }
}

/* ---------- genres ---------- */
const withDiscover = (cfgs: ProviderCfg[], need: "genres" | "discover") => cfgs.filter((c) => c.enabled && c.key && PROVIDERS.find((p) => p.id === c.id)?.[need])

/** Genre names for the pills on Movies / Series (empty until a provider with genre support is enabled). */
export function useGenres(kind: "movie" | "series") {
  const catGenres = useCatalog((s) => s.byKind[kind])
  const own = useMemo(() => [...new Set(catGenres.flatMap((i) => i.genres ?? []))].sort(), [catGenres]) // catalog-provided (Plex, Jellyfin)
  const saved = useApp((s) => s.settings.meta)
  const cfgs = useMemo(() => withDiscover(normalizeCfg(saved), "genres"), [saved])
  const sig = cfgs.map((c) => `${c.id}:${c.lang ?? ""}`).join(",")
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    if (own.length || !cfgs.length) return setNames([])
    let live = true
    const key = `genres:${kind}:${sig}`
    ;(async () => {
      const c = await get<{ at: number; n: string[] }>(key)
      if (c && Date.now() - c.at < 30 * 864e5) return live && void setNames(c.n)
      for (const cfg of cfgs) {
        const n = await PROVIDERS.find((p) => p.id === cfg.id)!.genres!(kind, cfg)
        if (n?.length) { void set(key, { at: Date.now(), n }); return live && void setNames(n) }
      }
    })().catch(() => {})
    return () => { live = false }
  }, [kind, sig, own.length]) // eslint-disable-line react-hooks/exhaustive-deps
  return own.length ? own : names
}

const BATCH = 4 // provider pages per fetch (20 titles each)

/** Titles of a genre that exist in the user's catalog: provider "discover" pages matched by title, loaded 4 pages at a time. */
export function useGenreTitles(kind: "movie" | "series", genre: string) {
  const saved = useApp((s) => s.settings.meta)
  const cfgs = useMemo(() => withDiscover(normalizeCfg(saved), "discover"), [saved])
  const sig = cfgs.map((c) => `${c.id}:${c.lang ?? ""}`).join(",")
  const byKind = useCatalog((s) => s.byKind)
  const [refs, setRefs] = useState<SimilarRef[]>([])
  const [state, setState] = useState({ next: 1, pages: 1, loading: false, unknown: false })
  const own = useMemo(() => (byKind[kind].some((i) => i.genres?.length) ? byKind[kind].filter((i) => i.genres?.includes(genre)) : null), [byKind, kind, genre])

  const loadBatch = async (from: number, reset: boolean) => {
    if (!cfgs.length || own) return
    setState((s) => ({ ...s, loading: true }))
    const cfg = cfgs[0]
    const prov = PROVIDERS.find((p) => p.id === cfg.id)!
    const pageNums = Array.from({ length: BATCH }, (_, i) => from + i)
    const res = await Promise.all(pageNums.map(async (pg) => {
      const key = `genre:${kind}:${genre}:${sig}:${pg}`
      const c = await get<{ at: number; r: Awaited<ReturnType<NonNullable<Provider["discover"]>>> }>(key)
      if (c && Date.now() - c.at < 7 * 864e5) return c.r
      const r = await prov.discover!(kind, genre, pg, cfg).catch(() => null)
      if (r) void set(key, { at: Date.now(), r })
      return r
    }))
    const ok = res.filter(Boolean) as { refs: SimilarRef[]; pages: number }[]
    setRefs((prev) => [...(reset ? [] : prev), ...ok.flatMap((r) => r.refs)])
    setState({ next: from + BATCH, pages: ok[0]?.pages ?? 1, loading: false, unknown: reset && !ok.length })
  }
  useEffect(() => { setRefs([]); void loadBatch(1, true) }, [kind, genre, sig]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => {
    const out: Item[] = []
    for (const r of refs) { const i = findInCatalog(byKind, kind, r.title, r.year, undefined, r.alt); if (i && !out.includes(i)) out.push(i) }
    return out
  }, [refs, byKind, kind])
  if (own) return { items: own, available: true, ...state, loading: false, unknown: false, hasMore: false, more: async () => {} }
  return { items, available: cfgs.length > 0, ...state, hasMore: state.next <= state.pages, more: () => loadBatch(state.next, false) }
}
