import { ALL, FAV } from "@/components/tv/groups"
import { Card, Rail, SectionTitle } from "@/components/gtv"
import { Chips, Empty, Shell, VGrid, Pending } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useBrowse } from "@/layouts/hooks/use-browse"
import { useMode } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { KEY } from "@/lib/nav"
import type { Item, Kind } from "@/lib/types"

export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const { groups, status, g, setG, items, rails, genres: genreNames, pct, isLocked, canLock, toggleLock: toggle, open, openCategory, openGenre, kindLabel, page } = useBrowse(kind)
  const mode = useMode()
  const t = useT()
  // yellow key (tv) or right-click / long-press (elsewhere) toggles the parental lock on a category
  const card = (i: Item) => <Card key={i.id} item={i} pct={pct(i)} onOpen={() => open(i)} />
  return (
    <Shell page={page} title={kindLabel}>
      {status !== "ready" ? <Pending /> : (
        <div className="flex h-full flex-col">
          <SourceFilter />
          <Chips items={[ALL, FAV, ...groups]} active={g} onPick={(c) => (c === ALL || c === FAV ? setG(c) : openCategory(c))} locked={isLocked}
            onKey={(e, c) => { if (e.keyCode === KEY.yellow) toggle(c) }}
            onCtx={(e, c) => { if (mode !== "tv" && canLock && c !== FAV && c !== ALL) { e.preventDefault(); toggle(c) } }} />
          <div className="min-h-0 flex-1">
            {g === ALL ? (
              rails.length ? <div className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar">{genreNames.length > 0 && <section className="mb-2"><SectionTitle>{t("pages.browse.genres")}</SectionTitle><Chips items={genreNames} active="" onPick={(n) => openGenre(n)} /></section>}{rails.map(([c, a]) => <Rail key={c} title={c} onSeeAll={() => openCategory(c)}>{a.map(card)}</Rail>)}</div> : <Empty>{t("pages.browse.empty")}</Empty>
            ) : items.length ? <VGrid items={items} render={card} /> : <Empty>{t("pages.browse.empty")}</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
