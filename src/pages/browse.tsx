import { useEffect, useRef, useState } from "react"
import { ALL, FAV, useGroupCount } from "@/components/tv/groups"
import { Card, Rail, SectionTitle } from "@/components/gtv"
import { AlphaRail, Chips, Empty, Shell, VGrid, Pending } from "@/components/tv/ui"
import { BrowseFilters } from "@/components/tv/filter-bar"
import { useBrowse } from "@/layouts/hooks/use-browse"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { KEY } from "@/lib/nav"
import type { Item, Kind } from "@/lib/types"
import { cn } from "@/lib/utils"

export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const { groups, status, g, setG, items, list, alpha, cats, toggleCat, clearCats, activeCount, refined, q, setQ, sort, setSort, sorts, rails, genres: genreNames, pct, isLocked, canLock, toggleLock: toggle, open, openCategory, openGenre, kindLabel, page } = useBrowse(kind)
  const mode = useMode()
  const count = useGroupCount(kind)
  const t = useT()
  const jump = useRef<((index: number) => void) | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  // a letter needs the list in A-Z order: sort first, then jump once that list has rendered
  useEffect(() => { if (pending == null) return; jump.current?.(pending); setPending(null) }, [pending, list])
  // yellow key (tv) or right-click / long-press (elsewhere) toggles the parental lock on a category
  const card = (i: Item) => <Card key={i.id} item={i} pct={pct(i)} onOpen={() => open(i)} />
  return (
    <Shell page={page} title={kindLabel}>
      {status !== "ready" ? <Pending /> : (
        (() => {
          const filters = (<>
            <Chips cat count={count} items={[ALL, FAV, ...groups]} active={g} onPick={(c) => (c === ALL || c === FAV ? setG(c) : openCategory(c))} locked={isLocked}
              onKey={(e, c) => { if (e.keyCode === KEY.yellow) toggle(c) }}
              onCtx={(e, c) => { if (mode !== "tv" && canLock && c !== FAV && c !== ALL) { e.preventDefault(); toggle(c) } }} />
            <BrowseFilters kind={kind} q={q} setQ={setQ} sort={sort} setSort={setSort} sorts={sorts} cats={cats} toggleCat={toggleCat} clearCats={clearCats} activeCount={activeCount} label={t("pages.browse.filter")} />
          </>)
          // mobile: filters scroll with the content, which starts under the top bar and runs under the bottom bar (under-top / under-bottom)
          const up = "under-top"
          // A-Z grid + side index; picking a letter switches the sort so the letters line up with the rows
          const grid = (it: Item[], head?: React.ReactNode) => (<>
            <VGrid items={it} render={card} head={head} className={head ? up : undefined} scrollRef={jump} />
            <AlphaRail letters={alpha} onPick={(index) => { setSort("az"); setPending(index) }} />
          </>)
          const body = (head?: React.ReactNode) => refined
            ? list.length ? grid(list, head) : null
            : g === ALL
              ? rails.length ? <div className={cn("under-bottom -mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar", head && up)}>{head}{genreNames.length > 0 && <section className="mb-2"><SectionTitle>{t("pages.browse.genres")}</SectionTitle><Chips items={genreNames} active="" onPick={(n) => openGenre(n)} /></section>}{rails.map(([c, a]) => <Rail key={c} title={c} onSeeAll={() => openCategory(c)}>{a.map(card)}</Rail>)}</div> : null
              : items.length ? grid(items, head) : null
          { const b = body(filters); if (b) return b }
          return (
            <div className="flex h-full flex-col">
              {filters}
              <div className="min-h-0 flex-1">{body() ?? <Empty>{q.trim() ? t("pages.browse.noMatch") : t("pages.browse.empty")}</Empty>}</div>
            </div>
          )
        })()
      )}
    </Shell>
  )
}
