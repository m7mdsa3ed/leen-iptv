import { useMemo } from "react"
import { ALL, FAV } from "@/components/tv/groups"
import { Chips, Empty, Shell, VGrid, Pending } from "@/components/tv/ui"
import { Card } from "@/components/gtv"
import { SourceFilter } from "../source-ui"
import { useBrowse } from "@/layouts/hooks/use-browse"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import type { Item, Kind } from "@/lib/types"

/** Google TV Movies / Shows: category pill row over one big poster grid (All = every rail merged). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const { groups, status, g, setG, items, rails, genres, pct, isLocked, canLock, toggleLock: toggle, open, openCategory, openGenre, kindLabel, page } = useBrowse(kind)
  const mode = useMode()
  const t = useT()
  const list = useMemo(() => (g === ALL ? [...new Set(rails.flatMap(([, a]) => a))] : items), [g, rails, items])
  return (
    <Shell page={page} title={kindLabel}>
      {status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex h-full flex-col">
          <SourceFilter />
          {/* one pill row: All, Favorites, genres (open the TMDB genre page), then categories (filter in place; locked ones go through their PIN-gated page) */}
          <Chips cat items={[ALL, FAV, ...genres.filter((x) => !groups.includes(x)), ...groups]} active={g} locked={isLocked}
            onPick={(c) => (c === ALL || c === FAV || (groups.includes(c) && !isLocked(c)) ? setG(c) : groups.includes(c) ? openCategory(c) : openGenre(c))}
            onKey={(e, c) => { if (e.keyCode === KEY.yellow) toggle(c) }}
            onCtx={(e, c) => { if (mode !== "tv" && canLock && c !== FAV && c !== ALL) { e.preventDefault(); toggle(c) } }} />
          <div className="min-h-0 flex-1">
            {list.length ? <VGrid items={list} minW={mode === "tv" ? 270 : mode === "mobile" ? 105 : 190} label={56} render={(i: Item) => <Card key={i.id} fluid item={i} pct={pct(i)} onOpen={() => open(i)} />} /> : <Empty>{t("gtv.browse.empty")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
