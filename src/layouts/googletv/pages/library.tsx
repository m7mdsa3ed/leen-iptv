import { Check, Plus, Settings2 } from "lucide-react"
import { Card, SkelRail } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import { useLibrary } from "@/layouts/hooks/use-library"
import { useRoute } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"
import { GRail, useLeft } from "../parts"
import { SourceFilter } from "../source-ui"

/** Google TV Library: Watchlist, History and Sources as rails. */
export default function Library() {
  const t = useT()
  const L = useLibrary()
  const { status, continueWatching, favorites, history, pct, open, sources, sourceId, setSource, addSource } = L
  const go = useRoute((s) => s.go)
  const liveFavs = favorites.filter((i) => i.kind === "live")
  const vodFavs = favorites.filter((i) => i.kind !== "live")
  const left = useLeft()
  const empty = !favorites.length && !continueWatching.length && !history.length
  const tile = "flex h-28 w-64 shrink-0 flex-col justify-between rounded-2xl p-4 text-start"
  return (
    <Shell page="library" title={t("gtv.library.title")}>
      <div className="under-top under-bottom no-scrollbar -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
        <SourceFilter className="mb-2" />
        {status !== "ready" ? <><SkelRail variant="wide" /><SkelRail /></> : (
          <>
            {continueWatching.length > 0 && <GRail title={t("gtv.library.continue")}>{continueWatching.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} pct={pct(i)} sub={left(i)} onOpen={() => open(i)} />)}</GRail>}
            {vodFavs.length > 0 && <GRail title={t("gtv.library.watchlist")}>{vodFavs.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
            {history.length > 0 && <GRail title={t("gtv.library.history")}>{history.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} onOpen={() => open(i)} />)}</GRail>}
            {liveFavs.length > 0 && <GRail title={t("gtv.library.live")}>{liveFavs.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i)} />)}</GRail>}
            {empty && <div className="h-40"><Empty>{t("gtv.library.empty")}</Empty></div>}
          </>
        )}
        <GRail title={t("gtv.library.sources")}>
          {sources.map((s) => (
            <button key={s.id} data-nav data-pill onClick={() => setSource(s.id)} className={cn(tile, s.id === sourceId ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground")}>
              <span dir="auto" className="line-clamp-2 text-lg font-medium">{s.name}</span>
              <span className="flex items-center gap-1 text-sm text-foreground/70">{s.id === sourceId && <Check className="size-4" />}{s.type}{s.id === sourceId ? " · " + t("gtv.library.active") : ""}</span>
            </button>
          ))}
          <button data-nav data-pill onClick={addSource} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><Plus className="size-6" /><span className="text-lg">{t("gtv.library.addSource")}</span></button>
          <button data-nav data-pill onClick={() => go("sources")} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><Settings2 className="size-6" /><span className="text-lg">{t("gtv.library.manageSources")}</span></button>
          <button data-nav data-pill onClick={L.openHistory} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><span className="text-lg">{t("gtv.library.watchHistory")}</span></button>
          <button data-nav data-pill onClick={L.openStats} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><span className="text-lg">{t("gtv.library.stats")}</span></button>
        </GRail>
      </div>
    </Shell>
  )
}
