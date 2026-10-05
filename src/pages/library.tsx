import { Plus } from "lucide-react"
import { Card, Pill, Rail } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import { useLibrary } from "@/layouts/hooks/use-library"

/** Default Library: Continue watching, Watchlist (favorites), History and Sources. */
export default function Library() {
  const L = useLibrary()
  const t = useT()
  const { status, continueWatching, favorites, history, pct, open, sources, sourceId, setSource, addSource } = L
  const empty = !continueWatching.length && !favorites.length && !history.length
  return (
    <Shell page="library" title={t("pages.library.title")}>
      <div className="under-top under-bottom no-scrollbar -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
        <SourceFilter className="pt-2" />
        {status !== "ready" ? <Pending /> : (
          <>
            {continueWatching.length > 0 && <Rail title={t("pages.library.continue")}>{continueWatching.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} pct={pct(i)} onOpen={() => open(i)} />)}</Rail>}
            {favorites.length > 0 && <Rail title={t("pages.library.watchlist")}>{favorites.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
            {history.length > 0 && <Rail title={t("pages.library.history")}>{history.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} onOpen={() => open(i)} />)}</Rail>}
            {empty && <div className="h-48"><Empty>{t("pages.library.empty")}</Empty></div>}
          </>
        )}
        <section className="pb-6 pt-4">
          <h2 className="mb-3 text-2xl font-medium tracking-tight">{t("pages.library.sources")}</h2>
          <div className="-ms-1 flex flex-wrap gap-3 p-1">
            {sources.map((s) => <Pill key={s.id} variant={s.id === sourceId ? "primary" : "tonal"} onClick={() => setSource(s.id)}>{s.name}</Pill>)}
            <Pill onClick={addSource}><Plus />{t("pages.library.addSource")}</Pill>
            <Pill onClick={L.openHistory}>{t("pages.library.watchHistory")}</Pill>
            <Pill onClick={L.openStats}>{t("pages.library.stats")}</Pill>
          </div>
        </section>
      </div>
    </Shell>
  )
}
