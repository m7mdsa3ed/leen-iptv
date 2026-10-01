import { Check, Plus, Settings2 } from "lucide-react"
import { Card, SkelRail } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import { useLibrary } from "@/layouts/hooks/use-library"
import { useRoute } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { GRail, useLeft } from "../parts"

/** Google TV Library: Watchlist, History and Sources as rails. */
export default function Library() {
  const L = useLibrary()
  const { status, continueWatching, favorites, history, pct, open, sources, sourceId, setSource, addSource } = L
  const go = useRoute((s) => s.go)
  const liveFavs = favorites.filter((i) => i.kind === "live")
  const vodFavs = favorites.filter((i) => i.kind !== "live")
  const left = useLeft()
  const empty = !favorites.length && !continueWatching.length && !history.length
  const tile = "flex h-28 w-64 shrink-0 flex-col justify-between rounded-2xl p-4 text-left"
  return (
    <Shell page="library" title="Library">
      <div className="no-scrollbar -mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)]">
        {status !== "ready" ? <><SkelRail variant="wide" /><SkelRail /></> : (
          <>
            {continueWatching.length > 0 && <GRail title="Continue watching">{continueWatching.map((i) => <Card key={i.id} item={i} variant="wide" pct={pct(i)} sub={left(i)} onOpen={() => open(i)} />)}</GRail>}
            {vodFavs.length > 0 && <GRail title="Watchlist">{vodFavs.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</GRail>}
            {history.length > 0 && <GRail title="History">{history.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i)} />)}</GRail>}
            {liveFavs.length > 0 && <GRail title="Live channels">{liveFavs.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i)} />)}</GRail>}
            {empty && <div className="h-40"><Empty>Your watchlist and history show up here. Add a title with +.</Empty></div>}
          </>
        )}
        <GRail title="Sources">
          {sources.map((s) => (
            <button key={s.id} data-nav data-pill onClick={() => setSource(s.id)} className={cn(tile, s.id === sourceId ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground")}>
              <span className="line-clamp-2 text-lg font-medium">{s.name}</span>
              <span className="flex items-center gap-1 text-sm text-foreground/70">{s.id === sourceId && <Check className="size-4" />}{s.type}{s.id === sourceId ? " · active" : ""}</span>
            </button>
          ))}
          <button data-nav data-pill onClick={addSource} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><Plus className="size-6" /><span className="text-lg">Add source</span></button>
          <button data-nav data-pill onClick={() => go("sources")} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><Settings2 className="size-6" /><span className="text-lg">Manage sources</span></button>
          <button data-nav data-pill onClick={L.openHistory} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><span className="text-lg">Watch history</span></button>
          <button data-nav data-pill onClick={L.openStats} className={cn(tile, "items-start justify-center bg-surface-2 text-foreground")}><span className="text-lg">Viewing stats</span></button>
        </GRail>
      </div>
    </Shell>
  )
}
