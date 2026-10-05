import { useEffect, useMemo, useRef, useState } from "react"
import { get, set } from "idb-keyval"
import { useApp } from "@/lib/store"
import { useCatalog } from "@/lib/catalog"
import type { Item } from "@/lib/types"
import { DEFAULT_CFG, forceTmdb, PROVIDERS, tmdbSearch } from "./providers"
import { cleanTitle, matchId, matchKeyOf, norm } from "./title"
import { cached, forget, META_TTL, scheduleCachePrune } from "./cache"
import type { EpisodeMeta, Ids, Meta, PersonInfo, PersonRef, Provider, ProviderCfg, Query, SimilarRef } from "./types"


/** Saved config merged with the registry: unknown ids dropped, new providers appended (disabled). */
export function normalizeCfg(saved: ProviderCfg[] | undefined): ProviderCfg[] {
  const out = (saved ?? DEFAULT_CFG).filter((c) => PROVIDERS.some((p) => p.id === c.id))
  for (const p of PROVIDERS) if (!out.some((c) => c.id === p.id)) out.push({ id: p.id, enabled: false })
  return out
}

const emptyMeta = (): Meta => ({ genres: [], ratings: [], cast: [], directors: [], similar: [], ids: {} })

/** Run providers in priority order; the first non-empty value per field wins, ratings from all are kept. Ids found early feed later providers. */
export async function loadMeta(q: Query, cfgs: ProviderCfg[], onFail?: () => void): Promise<Meta> {
  const m = emptyMeta()
  const ids: Ids = { ...q.ids }
  for (const c of cfgs) {
    const p: Provider | undefined = PROVIDERS.find((x) => x.id === c.id)
    if (!p || !c.enabled) continue
    let r
    try { r = await p.fetch({ ...q, ids }, c) } catch { onFail?.(); continue } // one broken provider must not hide the others
    if (!r) continue
    for (const k of ["title", "year", "plot", "poster", "backdrop", "logo", "cert", "awards"] as const) m[k] ||= r[k]
    m.runtime ||= r.runtime
    if (!m.backdrops?.length && r.backdrops?.length) m.backdrops = r.backdrops
    if (!m.trailers?.length && r.trailers?.length) m.trailers = r.trailers
    for (const k of ["tagline", "original", "status", "next"] as const) (m as unknown as Record<string, unknown>)[k] ||= r[k]
    for (const k of ["languages", "countries", "studios", "crew"] as const) if (!m[k]?.length && r[k]?.length) (m[k] as unknown[]) = r[k]!
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

const sigOf = (cfgs: ProviderCfg[]) => cfgs.filter((c) => c.enabled).map((c) => `${c.id}:${c.key ? 1 : 0}:${c.lang ?? ""}`).join(",")
/** Cache key of a title lookup: what the title IS (kind + cleaned name + year), not the item id, so the same movie from another source / profile reuses the entry. A panel-provided id (`xid`) tells remakes apart. */
const lookupKey = (kind: string, ct: { title: string; year?: string }, xid: string, matched: string | undefined, sig: string) => `meta5:${kind}:${norm(ct.title)}:${ct.year ?? ""}:${xid}:${matched ?? ""}:${sig}`
const isEmptyMeta = (x: Meta) => !(x.plot || x.cast.length)

/** Settings > Fix matches: look a title up the way Detail would (same cache entry, no panel info) so it counts as checked. true = a provider knew it. */
export async function checkTitle(item: Item, cfgs: ProviderCfg[]): Promise<boolean> {
  return !isEmptyMeta(await titleMeta(item, cfgs))
}
/** The cached lookup behind checkTitle (and Replace posters, which wants its poster). Panel info is not used, so the panel's own poster never shows up here. */
export async function titleMeta(item: Item, cfgs: ProviderCfg[]): Promise<Meta> {
  const ct = cleanTitle(item.srcName ?? item.name)
  const kind = item.kind === "series" ? "series" : "movie"
  return cached(lookupKey(kind, ct, "", undefined, sigOf(cfgs)), META_TTL, async () => {
    let failed = false
    const r = await loadMeta({ kind, title: ct.title, year: ct.year, ids: {} }, cfgs, () => (failed = true))
    if (failed && isEmptyMeta(r)) throw new Error("lookup failed") // rate limited / offline: not cached as "nothing found"
    return r
  }, isEmptyMeta)
}

/** Source data (e.g. Plex, Jellyfin) beats providers: `base` wins per field, providers only fill gaps. */
function withBase(m: Meta, b?: Partial<Meta>): Meta {
  if (!b) return m
  const r = { ...m }
  for (const k of ["title", "year", "plot", "poster", "backdrop", "logo", "cert", "awards"] as const) r[k] = b[k] || m[k]
  r.runtime = b.runtime || m.runtime
  r.backdrops = b.backdrops?.length ? b.backdrops : m.backdrops
  r.trailers = b.trailers?.length ? b.trailers : m.trailers
  for (const k of ["genres", "directors", "similar"] as const) (r[k] as unknown[]) = b[k]?.length ? b[k]! : m[k]
  r.cast = b.cast?.length && (b.cast.some((c) => c.photo) || !m.cast.some((c) => c.photo)) ? b.cast : m.cast
  r.ratings = [...(b.ratings ?? []), ...m.ratings.filter((x) => !b.ratings?.some((y) => y.source === x.source))]
  r.ids = { ...m.ids, ...b.ids }
  return r
}

/** Key of a manual TMDB match (Settings `metaMatch`): what the title IS, so every copy of it shares the match. Uses the source's name, not a matched rename. */
export const matchKey = (item: Item) => matchKeyOf(item.kind, item.srcName ?? item.name)

/**
 * Matches that only hold a TMDB id (made by an older version, imported, or synced from an older device) have no title / poster / backdrop to show,
 * so the catalog keeps the panel's art. Look them up once (a few per session, quietly) and store what the catalog should show.
 */
export function useBackfillMatches() {
  const matches = useApp((s) => s.settings.metaMatch)
  const saved = useApp((s) => s.settings.meta)
  const setSettings = useApp((s) => s.setSettings)
  const cfg = useMemo(() => normalizeCfg(saved).find((c) => c.id === "tmdb" && c.enabled && c.key), [saved])
  const tried = useRef(new Set<string>())
  useEffect(() => {
    if (!cfg || !matches) return
    const todo = Object.entries(matches).filter(([k, v]) => !tried.current.has(k) && (typeof v === "string" || !v.poster)).slice(0, 25)
    if (!todo.length) return
    let live = true
    ;(async () => {
      for (const [k, v] of todo) {
        tried.current.add(k)
        try {
          const r = (await tmdbSearch(k.startsWith("series:") ? "series" : "movie", `tmdb ${matchId(v)}`, cfg))[0]
          const cur = useApp.getState().settings.metaMatch
          if (!live || !r || matchId(cur?.[k]) !== matchId(v)) continue // reset or changed meanwhile
          setSettings({ metaMatch: { ...cur, [k]: { id: r.id, title: r.title, year: r.year, poster: r.poster?.replace("/w185/", "/w500/"), backdrop: r.backdrop } } })
        } catch { /* offline / bad id: the Detail page fills it in when the title is opened */ }
      }
    })()
    return () => { live = false }
  }, [matches, cfg]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Details for a movie/series, cached for META_TTL (30 days); `refresh()` drops this title's cached data and fetches it again. `ready` = the Xtream info has been fetched (or will not be). */
export function useMeta(item: Item | undefined, xtream: Record<string, unknown> | undefined, ready: boolean, base?: Partial<Meta>, identity?: string) {
  const saved = useApp((s) => s.settings.meta)
  const cfgs = useMemo(() => normalizeCfg(saved), [saved])
  const entry = useApp((s) => (item ? s.settings.metaMatch?.[matchKey(item)] : undefined)) // manual match picked by the user
  const matched = matchId(entry)
  const [metaState, setMetaState] = useState<{ key: string; value: Meta } | null>(null)
  const [loading, setLoading] = useState(false)
  const [rev, setRev] = useState(0) // bumped by refresh(): reruns the load (and, through useSeasonMeta, the episode data)
  const keyRef = useRef("")
  const title = item ? cleanTitle(item.srcName ?? item.name) : undefined
  const titleKey = title ? `${item!.kind}:${norm(title.title)}:${title.year ?? ""}` : ""
  const metaKey = identity ?? titleKey
  const meta = metaState?.key === metaKey ? metaState.value : null
  const online = cfgs.some((c) => c.enabled && c.id !== "xtream" && (c.key || !PROVIDERS.find((p) => p.id === c.id)?.needsKey))
  const sig = sigOf(cfgs)

  useEffect(() => {
    if (!item || !ready || item.kind === "live") return
    let live = true
    const ct = cleanTitle(item.srcName ?? item.name) // the source's name: stable across a matched rename
    const titleKey = identity ?? `${item.kind}:${norm(ct.title)}:${ct.year ?? ""}`
    const q: Query = { kind: item.kind === "series" ? "series" : "movie", title: ct.title, year: ct.year, ids: matched ? { tmdb: matched } : {}, xtream }
    const run = matched ? cfgs.filter((c) => c.id !== "xtream") : cfgs // the user said the panel's data is wrong for this title
    const xid = String(xtream?.tmdb_id ?? xtream?.tmdb ?? xtream?.imdb_id ?? "")
    const key = (keyRef.current = lookupKey(q.kind, ct, xid, matched, sig))
    scheduleCachePrune()
    ;(async () => {
      setLoading(true)
      const c = online ? await get<{ at: number; v: Meta }>(key).catch(() => undefined) : undefined
      if (c && live) setMetaState({ key: titleKey, value: withBase(c.v, matched ? undefined : base) }) // stale-while-revalidate: show what we have at once
      // fresh entries return without a request; misses/stale go through the shared cache (one in-flight call per title)
      const m = online ? await cached(key, META_TTL, () => loadMeta(q, run), isEmptyMeta) : await loadMeta(q, run)
      if (live) setMetaState({ key: titleKey, value: withBase(m, matched ? undefined : base) }) // a manual match beats server data too. The cache holds the provider data only: source data (`base`) is merged fresh each time
      // older id-only matches: store what the catalog should show (title, poster, backdrop, year) now that we know it
      const cur = useApp.getState().settings.metaMatch
      const k = matchKey(item)
      if (matched && m.title && typeof cur?.[k] === "string") useApp.getState().setSettings({ metaMatch: { ...cur, [k]: { id: matched, title: m.title, year: m.year, poster: m.poster, backdrop: m.backdrop } } })
    })().finally(() => live && setLoading(false))
    return () => { live = false }
  }, [item, xtream, ready, sig, base, matched, rev, identity]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Forget this title's cached provider data (details + its seasons) and load it fresh. A wrong title is fixed with Match metadata, not here. */
  const refresh = async () => {
    const tmdb = meta?.ids.tmdb
    if (tmdb) forceTmdb(tmdb) // fetch from TMDB, not from the shared cache
    await forget([keyRef.current, ...(tmdb ? [`season:tmdb:${tmdb}:`] : [])].filter(Boolean))
    setRev((n) => n + 1)
  }
  return { meta, loading, online, matched, refresh, rev }
}

/** Provider episodes of one season (by TMDB id), cached for META_TTL (30 days); `rev` changes = load again (after a refresh). null until loaded, or when no provider can tell. */
export function useSeasonMeta(tmdb: string | undefined, season: number | null, rev = 0) {
  const saved = useApp((s) => s.settings.meta)
  const cfg = useMemo(() => normalizeCfg(saved).find((c) => c.enabled && c.key && PROVIDERS.find((p) => p.id === c.id)?.season), [saved])
  const [eps, setEps] = useState<EpisodeMeta[] | null>(null)
  useEffect(() => {
    setEps(null)
    if (!tmdb || season === null || !cfg) return
    let live = true
    const p = PROVIDERS.find((x) => x.id === cfg.id)!
    cached(`season:${cfg.id}:${tmdb}:${season}:${cfg.lang ?? ""}`, META_TTL, async () => (await p.season!(tmdb, season, cfg)) ?? [], (x) => !x.length)
      .then((r) => live && setEps(r))
      .catch(() => {}) // a season the provider does not have (numbering differs) just leaves the panel's episodes as they are
    return () => { live = false }
  }, [tmdb, season, cfg, rev])
  return eps
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
