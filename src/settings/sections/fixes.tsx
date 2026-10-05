import { useEffect, useMemo, useRef, useState } from "react"
import { ConfirmButton, Field, Pill, Row, SectionCard, Segmented } from "../controls"
import { Logo } from "@/components/tv/ui"
import { openLogoMatch, openMatch } from "@/components/tv/match"
import { logoState, useCatalog } from "@/lib/catalog"
import { autoPick, exportFixes, failedKey, logoFixes, mergeFixes, metaFixes, newestMetaFixes, parseFixes } from "@/lib/fixes-pure"
import { fmt, useT } from "@/lib/i18n"
import { loadLogoIndex } from "@/lib/logos"
import type { LogoIndex } from "@/lib/logos-pure"
import { checkTitle, normalizeCfg } from "@/lib/meta"
import { paced } from "@/lib/pace"
import { tmdbSearch } from "@/lib/meta/providers"
import { matchKeyOf } from "@/lib/meta/title"
import { allLookups, emptyLookups } from "@/lib/meta/cache"
import { useApp, useProfile } from "@/lib/store"
import { srcOfId } from "@/lib/merge-pure"
import { useSync } from "@/lib/sync"
import type { Item, MetaMatch } from "@/lib/types"

type Tab = "noLogo" | "guessed" | "meta" | "unchecked"
const PAGE = 50

/** Channels without a logo (or with one guessed by name) and titles without metadata, each fixed with the Match logo / Match metadata modal; export / import of the manual fixes. */
export default function FixesSection() {
  const t = useT()
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const sources = useApp((s) => s.sources)
  const byKind = useCatalog((s) => s.byKind) // re-run the lists when the catalog changes
  const profile = useProfile()
  const sync = useSync()
  const [ix, setIx] = useState<LogoIndex | null>(null)
  const [failed, setFailed] = useState(new Set<string>())
  const [looked, setLooked] = useState<Set<string> | undefined>()
  const [tab, setTab] = useState<Tab>("noLogo")
  const [q, setQ] = useState("")
  const [shown, setShown] = useState(PAGE)
  const [msg, setMsg] = useState("")
  const [auto, setAuto] = useState<{ done: number; total: number; fixed: number; wait?: boolean } | null>(null)
  const [autoRes, setAutoRes] = useState("")
  const stop = useRef(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void loadLogoIndex().then(setIx) }, [])
  const reload = () => {
    const keys = (ks: string[]) => new Set(ks.map(failedKey).filter((k): k is string => !!k))
    void emptyLookups().then((ks) => setFailed(keys(ks)))
    void allLookups().then((ks) => setLooked(keys(ks)))
  }
  useEffect(reload, [])
  useEffect(() => () => { stop.current = true }, []) // leaving the section ends a run
  useEffect(() => setShown(PAGE), [tab, q])

  // a PIN-locked category stays out of these lists too
  const open = (i: Item) => !profile?.pin || !profile.locked.includes(`${i.kind}|${i.group}`)
  const logos = useMemo(() => {
    const st = logoState()
    const live = sources.filter((s) => s.enabled !== false).flatMap((s) => st.raw(s.id).filter((i) => i.kind === "live" && open(i)))
    return logoFixes(live, ix, settings.logoMatch)
  }, [byKind, ix, settings.logoMatch, sources, profile]) // eslint-disable-line react-hooks/exhaustive-deps
  // Plex / Jellyfin titles carry the server's own metadata (poster, plot, cast): nothing to fix here, fix it on the server
  const metaAll = useMemo(() => {
    const server = new Set(sources.filter((x) => x.type === "plex" || x.type === "jellyfin").map((x) => x.id))
    return metaFixes([...byKind.movie, ...byKind.series].filter((i) => open(i) && !server.has(srcOfId(i.id))), failed, settings.metaMatch, looked)
  }, [byKind, failed, looked, settings.metaMatch, profile, sources]) // eslint-disable-line react-hooks/exhaustive-deps
  const metas = useMemo(() => metaAll.filter((m) => m.reason !== "unchecked"), [metaAll])
  const unchecked = useMemo(() => metaAll.filter((m) => m.reason === "unchecked"), [metaAll])
  const hasTmdb = !!normalizeCfg(settings.meta).find((c) => c.id === "tmdb")?.key

  const nLogo = Object.keys(settings.logoMatch ?? {}).length, nMeta = Object.keys(settings.metaMatch ?? {}).length
  const exportFile = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([exportFixes(settings)], { type: "application/json" }))
    a.download = "leen-matches.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importFile = async (f: File | undefined) => {
    if (!f) return
    const add = parseFixes(await f.text())
    if (!add) return setMsg(t("settings.fixes.importBad"))
    const m = mergeFixes(settings, add)
    setSettings({ logoMatch: Object.keys(m.logoMatch).length ? m.logoMatch : undefined, metaMatch: Object.keys(m.metaMatch).length ? m.metaMatch : undefined })
    setMsg(t("settings.fixes.imported", { logos: fmt.number(Object.keys(add.logoMatch).length), titles: fmt.number(Object.keys(add.metaMatch).length) }))
  }

  const rows = tab === "meta" || tab === "unchecked"
    ? (tab === "meta" ? metas : unchecked).map((m) => ({ k: m.key, item: m.item, sub: [m.item.group, t(m.reason === "failed" ? "settings.fixes.failed" : m.reason === "unchecked" ? "settings.fixes.unchecked" : "settings.fixes.noPoster")], fix: hasTmdb ? () => openMatch(m.item) : undefined }))
    : logos.filter((l) => l.from === (tab === "noLogo" ? "none" : "db"))
      .map((l) => ({ k: l.key, item: { ...l.item, logo: l.logo, logoAlt: undefined }, sub: [l.item.group, l.copies > 1 ? t("settings.fixes.copies", { n: fmt.number(l.copies) }) : ""], fix: () => openLogoMatch(l.item) }))
  const needle = q.trim().toLowerCase()
  const list = needle ? rows.filter((r) => r.item.name.toLowerCase().includes(needle)) : rows

  /** Not-checked titles get a normal lookup; the ones nothing is known about (and the other title tab) get a TMDB search, and a clear single hit is saved as a match. In batches of 15 (3 at a time) with a pause between, and a longer back-off when TMDB pushes back. */
  const autoFix = async () => {
    const cfgs = normalizeCfg(useApp.getState().settings.meta)
    const tm = cfgs.find((c) => c.id === "tmdb" && c.enabled && c.key)
    if (!tm) return
    const items = newestMetaFixes(list).map((r) => r.item)
    const probe = tab === "unchecked"
    let pending: Record<string, MetaMatch> = {}
    const flush = () => {
      if (!Object.keys(pending).length) return
      const add = pending
      pending = {}
      setSettings({ metaMatch: { ...add, ...useApp.getState().settings.metaMatch } }) // a match you made meanwhile wins
    }
    stop.current = false
    setAutoRes("")
    let fixed = 0
    const done = await paced(items, async (item) => {
      if (!(probe && await checkTitle(item, cfgs))) {
        const name = item.srcName ?? item.name
        const hit = autoPick(name, await tmdbSearch(item.kind === "series" ? "series" : "movie", name, tm))
        if (hit) { pending[matchKeyOf(item.kind, name)] = { id: hit.id, title: hit.title, year: hit.year, poster: hit.poster?.replace("/w185/", "/w500/"), backdrop: hit.backdrop }; fixed++ }
      }
    }, { stop, onState: (n, wait) => setAuto({ done: n, total: items.length, fixed, wait }), onBatch: flush })
    flush()
    reload()
    setAuto(null)
    setAutoRes(t("settings.fixes.auto.done", { done: fmt.number(done), fixed: fmt.number(fixed) }))
  }
  const nNone = logos.filter((l) => l.from === "none").length

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title={t("settings.fixes.yours")} description={sync.session ? t("settings.fixes.synced") : t("settings.fixes.notSynced")}>
        <Row label={t("settings.fixes.count", { logos: fmt.number(nLogo), titles: fmt.number(nMeta) })} description={msg || undefined}>
          <div className="flex flex-wrap gap-2">
            <Pill disabled={!nLogo && !nMeta} onClick={exportFile}>{t("settings.fixes.export")}</Pill>
            <Pill onClick={() => file.current?.click()}>{t("settings.fixes.import")}</Pill>
            <ConfirmButton disabled={!nLogo && !nMeta} onConfirm={() => setSettings({ logoMatch: undefined, metaMatch: undefined })}>{t("settings.fixes.clear")}</ConfirmButton>
          </div>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = "" }} />
        </Row>
      </SectionCard>

      <SectionCard title={t("settings.fixes.todo")} description={tab === "meta" || tab === "unchecked" ? t(!hasTmdb ? "settings.fixes.meta.noKey" : tab === "meta" ? "settings.fixes.meta.desc" : "settings.fixes.unchecked.desc") : t(tab === "noLogo" ? "settings.fixes.noLogo.desc" : "settings.fixes.guessed.desc")}>
        <Segmented<Tab> label={t("settings.fixes.todo")} value={tab} onChange={setTab} options={[
          { value: "noLogo", label: t("settings.fixes.tab.noLogo", { n: fmt.number(nNone) }) },
          { value: "guessed", label: t("settings.fixes.tab.guessed", { n: fmt.number(logos.length - nNone) }) },
          { value: "meta", label: t("settings.fixes.tab.meta", { n: fmt.number(metas.length) }) },
          { value: "unchecked", label: t("settings.fixes.tab.unchecked", { n: fmt.number(unchecked.length) }) },
        ]} />
        {(tab === "meta" || tab === "unchecked") && hasTmdb && (auto || list.length > 0) && (
          <div className="flex flex-wrap items-center gap-3">
            {auto
              ? <Pill onClick={() => { stop.current = true }}>{t("settings.fixes.auto.stop")}</Pill>
              : <Pill onClick={() => void autoFix()}>{t("settings.fixes.auto", { n: fmt.number(list.length) })}</Pill>}
            <span className="text-sm text-muted-foreground">{auto ? t(auto.wait ? "settings.fixes.auto.wait" : "settings.fixes.auto.running", { done: fmt.number(auto.done), total: fmt.number(auto.total), fixed: fmt.number(auto.fixed) }) : autoRes}</span>
          </div>
        )}
        <Field label={t("common.search")} value={q} onChange={setQ} dir="auto" />
        <div className="flex flex-col gap-2" data-nav-group>
          {!list.length && <div className="py-4 text-center text-muted-foreground">{t("settings.fixes.empty")}</div>}
          {list.slice(0, shown).map((r) => (
            <button key={r.k} data-nav disabled={!r.fix} onClick={r.fix} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2 text-start disabled:opacity-60">
              <Logo item={r.item} className={r.item.kind === "live" ? "aspect-video h-12 shrink-0 rounded-lg bg-white/90 p-1" : "h-16 w-11 shrink-0 rounded-lg object-cover"} />
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate text-base">{r.item.srcName ?? r.item.name}</div>
                <div dir="auto" className="truncate text-sm text-muted-foreground">{r.sub.filter(Boolean).join("  ·  ")}</div>
              </div>
              {r.fix && <span className="shrink-0 rounded-full bg-surface-3 px-3 py-1 text-sm">{t("settings.fixes.fix")}</span>}
            </button>
          ))}
          {list.length > shown && <Pill className="self-center" onClick={() => setShown(shown + PAGE)}>{t("settings.fixes.more", { n: fmt.number(list.length - shown) })}</Pill>}
        </div>
      </SectionCard>
    </div>
  )
}
