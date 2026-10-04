import { useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"
import { Pill } from "@/components/gtv"
import { focusFirst } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { useT } from "@/lib/i18n"
import { explain } from "@/lib/net"
import { matchKey, normalizeCfg } from "@/lib/meta"
import { tmdbSearch, type Candidate } from "@/lib/meta/providers"
import { cleanTitle, matchId } from "@/lib/meta/title"
import { cn } from "@/lib/utils"
import { closeMatch, useMatch } from "./match"

/** "Match metadata" on Detail: search TMDB and pin the right movie/show for this title (Settings `metaMatch`), or go back to automatic. */
export function MatchModal() {
  const item = useMatch((s) => s.item)
  const t = useT()
  const saved = useApp((s) => s.settings.meta)
  const matches = useApp((s) => s.settings.metaMatch)
  const setSettings = useApp((s) => s.setSettings)
  const cfg = useMemo(() => normalizeCfg(saved).find((c) => c.id === "tmdb"), [saved])
  const [q, setQ] = useState("")
  const [res, setRes] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const seq = useRef(0)
  const kind = item?.kind === "series" ? "series" : "movie"

  const run = async (query: string) => {
    if (!cfg?.key || !query.trim()) return
    const n = ++seq.current // only the latest search may write
    setBusy(true); setErr("")
    try { const r = await tmdbSearch(kind, query, cfg); if (n === seq.current) setRes(r) }
    catch (e) { if (n === seq.current) { setErr(explain(e)); setRes(null) } }
    finally { if (n === seq.current) setBusy(false) }
  }
  useEffect(() => {
    if (!item) return
    const c = cleanTitle(item.srcName ?? item.name) // the source's own name, also after a match renamed it
    const q0 = c.year ? `${c.title} (${c.year})` : c.title
    setQ(q0); setRes(null); void run(q0)
    requestAnimationFrame(focusFirst)
  }, [item]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null

  const key = matchKey(item)
  const cur = matchId(matches?.[key])
  // the match carries what the catalog shows from now on: title, year, poster (catalog size), backdrop
  const save = (r?: Candidate) => {
    const m = { ...matches }
    if (r) m[key] = { id: r.id, title: r.title, year: r.year, poster: r.poster?.replace("/w185/", "/w500/"), backdrop: r.backdrop }
    else delete m[key]
    setSettings({ metaMatch: m })
    closeMatch()
  }
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("nav.match.title")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeMatch()}>
      <div className="flex max-h-full w-full max-w-[36rem] flex-col gap-4 rounded-[28px] bg-surface p-6 shadow-2xl">
        <div className="text-center text-2xl font-semibold">{t("nav.match.title")}</div>
        <div dir="auto" className="truncate text-center text-base text-muted-foreground">{item.srcName ?? item.name}</div>
        <div className="flex items-center gap-2">
          <input data-nav value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.keyCode === 13) void run(q) }} type="search" enterKeyHint="search" autoComplete="off"
            placeholder={t("common.search")} aria-label={t("common.search")} dir="auto" className="min-h-11 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-base outline-none" />
          <Pill data-nav variant="primary" onClick={() => void run(q)}><Search className="size-4" />{t("common.search")}</Pill>
        </div>
        <div className="text-sm text-muted-foreground">{t("nav.match.hint")}</div>
        <div className="-mx-2 flex min-h-0 flex-col gap-2 overflow-y-auto px-2" data-nav-group>
          {busy && !res && <div className="py-4 text-center text-muted-foreground">{t("nav.match.searching")}</div>}
          {err && <div className="py-2 text-center text-destructive">{err}</div>}
          {res?.length === 0 && <div className="py-4 text-center text-muted-foreground">{t("nav.match.empty")}</div>}
          {res?.map((r) => (
            <button key={r.id} data-nav onClick={() => save(r)} className={cn("flex items-center gap-3 rounded-2xl p-2 text-start", r.id === cur ? "bg-accent-blue-container" : "bg-surface-2")}>
              {r.poster ? <img src={r.poster} alt="" loading="lazy" className="h-24 w-16 shrink-0 rounded-lg object-cover" /> : <div className="h-24 w-16 shrink-0 rounded-lg bg-surface-3" />}
              <div className="min-w-0 flex-1">
                <div dir="auto" className="truncate text-base font-medium">{r.title}</div>
                {r.alt && r.alt !== r.title && <div dir="auto" className="truncate text-sm text-muted-foreground">{r.alt}</div>}
                <div className="text-sm text-muted-foreground">{[r.year, r.id === cur ? t("nav.match.current") : ""].filter(Boolean).join("  ·  ")}</div>
                {r.overview && <div dir="auto" className="line-clamp-2 text-sm text-foreground/70">{r.overview}</div>}
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {cur && <Pill data-nav className="flex-1" onClick={() => save()}>{t("nav.match.reset")}</Pill>}
          <Pill data-nav className="flex-1" onClick={closeMatch}>{t("common.cancel")}</Pill>
        </div>
      </div>
    </div>
  )
}
