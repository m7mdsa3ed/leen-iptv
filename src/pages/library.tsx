import { Plus } from "lucide-react"
import { Card, Pill, Rail, SkelRail } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { Empty, Shell } from "@/components/tv/ui"
import { useLibrary } from "@/layouts/hooks/use-library"

/** Default Library: Continue watching, Watchlist (favorites), History and Sources. */
export default function Library() {
  const L = useLibrary()
  const { status, continueWatching, favorites, history, pct, open, sources, sourceId, setSource, addSource } = L
  const empty = !continueWatching.length && !favorites.length && !history.length
  return (
    <Shell page="library" title="Library">
      <div className="no-scrollbar -mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)]">
        <SourceFilter className="pt-2" />
        {status !== "ready" ? <><SkelRail variant="wide" /><SkelRail /></> : (
          <>
            {continueWatching.length > 0 && <Rail title="Continue watching">{continueWatching.map((i) => <Card key={i.id} item={i} variant="wide" pct={pct(i)} onOpen={() => open(i)} />)}</Rail>}
            {favorites.length > 0 && <Rail title="Watchlist">{favorites.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
            {history.length > 0 && <Rail title="History">{history.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i)} />)}</Rail>}
            {empty && <div className="h-48"><Empty>Nothing here yet. Star titles or start watching.</Empty></div>}
          </>
        )}
        <section className="pb-6 pt-4">
          <h2 className="mb-3 text-2xl font-medium tracking-tight">Sources</h2>
          <div className="-ml-1 flex flex-wrap gap-3 p-1">
            {sources.map((s) => <Pill key={s.id} variant={s.id === sourceId ? "primary" : "tonal"} onClick={() => setSource(s.id)}>{s.name}</Pill>)}
            <Pill onClick={addSource}><Plus />Add source</Pill>
            <Pill onClick={L.openHistory}>Watch history</Pill>
            <Pill onClick={L.openStats}>Viewing stats</Pill>
          </div>
        </section>
      </div>
    </Shell>
  )
}
