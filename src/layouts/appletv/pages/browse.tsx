import { useMemo } from "react"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useBrowse } from "../../hooks/use-browse"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import { useApp } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"
import { Hero, Shelf, SourceFilter, Tile } from "../ui"

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)

/** Movies / Shows: one featured banner, category capsules, then Top, Genres and category shelves. */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const mode = useMode()
  const toggleFav = useApp((s) => s.toggleFav)
  const top = useMemo(() => {
    const all = B.rails.flatMap(([, a]) => a)
    return all.filter((i, n) => all.findIndex((x) => x.id === i.id) === n).sort((a, b) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0)).slice(0, 20)
  }, [B.rails])
  const picks = top.slice(0, 5).map((item) => ({ item, kicker: `Top ${B.kindLabel}` }))
  const tile = (i: Item) => <Tile key={i.id} item={i} shape="poster" size="poster" pct={B.pct(i)} onOpen={() => B.open(i)} />
  return (
    <Shell page={B.page} title={B.kindLabel}>
      {B.status !== "ready" ? <Pending /> : (
        <div data-nav-group className="atv-scroll overflow-y-auto">
          {picks.length > 0
            ? <Hero picks={picks} tall={false} onPlay={B.open} isFav={B.isFav} onFav={(i) => toggleFav(i.id)} />
            : <h1 className="atv-h1 pb-2 pt-[calc(var(--hdr)+1rem)] text-[2.5rem]">{B.kindLabel}</h1>}
          <div className="atv-after-hero">
            <SourceFilter className="-mt-2 mb-2" />
            {B.rails.length ? (
              <>
                {top.length > 0 && <Shelf title={`Top ${B.kindLabel}`}>{top.map(tile)}</Shelf>}
                {B.genres.length > 0 && (
                  <Shelf title="Genres">
                    {B.genres.map((n) => (
                      <button key={n} data-nav data-atv-card onClick={() => B.openGenre(n)} className="atv-card atv-w-up">
                        <div className="atv-lift"><div className="atv-art grid aspect-video place-items-center px-4 text-center text-2xl font-bold text-white" style={{ background: `linear-gradient(135deg, hsl(${hue(n)} 55% 38%), hsl(${(hue(n) + 50) % 360} 60% 22%))` }}>{n}</div><span aria-hidden className="atv-glow" /></div>
                        <div className="atv-cap"><div className="h-5" /></div>
                      </button>
                    ))}
                  </Shelf>
                )}
                {B.rails.map(([c, a]) => (
                  <Shelf key={c} title={c} locked={B.isLocked(c)} onTitle={() => B.openCategory(c)}
                    titleProps={{ onKeyDown: (e) => { if (e.keyCode === KEY.yellow) void B.toggleLock(c) }, onContextMenu: (e) => { if (mode !== "tv" && B.canLock) { e.preventDefault(); void B.toggleLock(c) } } }}>
                    {a.map(tile)}
                  </Shelf>
                ))}
              </>
            ) : <div className="h-48"><Empty>Nothing here</Empty></div>}
          </div>
        </div>
      )}
    </Shell>
  )
}
