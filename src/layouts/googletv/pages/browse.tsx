import { ALL, CONT, FAV, useGroupCount } from "@/components/tv/groups"
import { Card } from "@/components/gtv"
import { Chips, Empty, Shell, VGrid, Pending, useCardFlags } from "@/components/tv/ui"
import { BrowseFilters } from "@/components/tv/filter-bar"
import { useBrowse } from "@/layouts/hooks/use-browse"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import type { Item, Kind } from "@/lib/types"

/** Google TV Movies / Shows: category pill row and a filter bar over one big poster grid (All = every rail merged). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const { status, groups, genres, g, setG, list, cats, toggleCat, clearCats, activeCount, q, setQ, sort, setSort, sorts, pct, isLocked, canLock, toggleLock: toggle, open, openCategory, openGenre, kindLabel, page } = useBrowse(kind)
  const mode = useMode()
  const count = useGroupCount(kind)
  const flags = useCardFlags()
  const t = useT()
  return (
    <Shell page={page} title={kindLabel}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        (() => {
          const filters = (<>
            {/* one pill row: All, Favorites, genres (open the TMDB genre page), then categories (open their PIN-gated page; yellow key / right-click locks one) */}
            <Chips cat count={count} items={[ALL, ...(count(CONT) || g === CONT ? [CONT] : []), FAV, ...genres.filter((x) => !groups.includes(x)), ...groups]} active={g} locked={isLocked}
              onPick={(c) => (c === ALL || c === CONT || c === FAV || (groups.includes(c) && !isLocked(c)) ? setG(c) : groups.includes(c) ? openCategory(c) : openGenre(c))}
              onKey={(e, c) => { if (e.keyCode === KEY.yellow) toggle(c) }}
              onCtx={(e, c) => { if (mode !== "tv" && canLock && c !== CONT && c !== FAV && c !== ALL) { e.preventDefault(); toggle(c) } }} />
            {/* filter bar: the Filters button opens the multi-select panel, then the title search, the sort pills and the picked chips */}
            <BrowseFilters kind={kind} q={q} setQ={setQ} sort={sort} setSort={setSort} sorts={sorts} cats={cats} toggleCat={toggleCat} clearCats={clearCats} activeCount={activeCount} label={t("gtv.browse.filter")} />
          </>)
          const grid = (head?: React.ReactNode, cls?: string) => (<>
            <VGrid items={list} head={head} className={cls} minW={mode === "tv" ? 270 : mode === "mobile" ? 105 : 190} label={56} render={(i: Item) => <Card key={i.id} fluid item={i} pct={pct(i)} onOpen={open} fav={flags.fav(i)} locked={flags.locked(i)} badge={flags.badge} />} />
          </>)
          // mobile: filters + grid scroll together and start under the top bar, so content fades under its gradient instead of stopping below it
          // one tree whether or not anything matches: a different root would remount the filter input mid-typing (and its on-screen keyboard would write into the old node)
          return grid(<>{filters}{!list.length && <div className="h-[50vh]"><Empty>{q.trim() ? t("gtv.browse.noMatch") : t("gtv.browse.empty")}</Empty></div>}</>, "under-top")
        })()
      )}
    </Shell>
  )
}
