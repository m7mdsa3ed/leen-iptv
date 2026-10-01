import { useMemo, useState } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { Card, Rail, SectionTitle } from "@/components/gtv"
import { useGenres } from "@/lib/meta"
import { Chips, Empty, Shell, VGrid, useOpen, Pending, askPin } from "@/components/tv/ui"
import { useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { KEY, useRoute } from "@/lib/nav"
import { useApp, usePData, useProfile } from "@/lib/store"
import type { Item, Kind } from "@/lib/types"

const MAX_RAILS = 30
const RAIL_ITEMS = 20

export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const { byKind, groups, status } = useCatalog()
  const d = usePData()
  const p = useProfile()
  const toggleLock = useApp((s) => s.toggleLock)
  const open = useOpen()
  const mode = useMode()
  const go = useRoute((s) => s.go)
  const genreNames = useGenres(kind)
  const [g, setG] = useState(ALL)
  const openCategory = (c: string) => go("category", { id: `${kind}|${c}` })
  const lockKey = (c: string) => `${kind}|${c}`
  const pct = (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100
  const items = useMemo(() => (g === FAV ? byKind[kind].filter((i) => d.favs.includes(i.id)) : g === ALL ? [] : byKind[kind].filter((i) => i.group === g)), [g, byKind, kind, d.favs])
  const rails = useMemo(() => {
    if (g !== ALL) return []
    const by = new Map<string, Item[]>()
    for (const i of byKind[kind]) { const a = by.get(i.group); if (!a) by.set(i.group, [i]); else if (a.length < RAIL_ITEMS) a.push(i) }
    return groups[kind].slice(0, MAX_RAILS).map((c) => [c, by.get(c) || []] as const).filter(([, a]) => a.length)
  }, [g, byKind, groups, kind])
  // yellow key (tv) or right-click / long-press (elsewhere) toggles the parental lock on a category
  const toggle = async (c: string) => {
    if (c === FAV || c === ALL || !p?.pin) return
    if (p.locked.includes(lockKey(c)) && !(await askPin(p.pin))) return
    toggleLock(lockKey(c))
  }
  const card = (i: Item) => <Card key={i.id} item={i} pct={pct(i)} onOpen={() => open(i)} />
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={kind === "movie" ? "Movies" : "Series"}>
      {status !== "ready" ? <Pending /> : (
        <div className="flex h-full flex-col">
          <Chips items={[ALL, FAV, ...groups[kind]]} active={g} onPick={(c) => (c === ALL || c === FAV ? setG(c) : openCategory(c))} locked={(c) => !!p?.locked.includes(lockKey(c))}
            onKey={(e, c) => { if (e.keyCode === KEY.yellow) toggle(c) }}
            onCtx={(e, c) => { if (mode !== "tv" && p?.pin && c !== FAV && c !== ALL) { e.preventDefault(); toggle(c) } }} />
          <div className="min-h-0 flex-1">
            {g === ALL ? (
              rails.length ? <div className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar">{genreNames.length > 0 && <section className="mb-2"><SectionTitle>Genres</SectionTitle><Chips items={genreNames} active="" onPick={(n) => go("genre", { id: `${kind}|${n}` })} /></section>}{rails.map(([c, a]) => <Rail key={c} title={c} onSeeAll={() => openCategory(c)}>{a.map(card)}</Rail>)}</div> : <Empty>Nothing here</Empty>
            ) : items.length ? <VGrid items={items} render={card} /> : <Empty>Nothing here</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
