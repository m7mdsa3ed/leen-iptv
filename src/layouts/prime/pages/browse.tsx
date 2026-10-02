import { Chips, Empty, Shell, Pending } from "@/components/tv/ui"
import { ALL, FAV, useBrowse } from "../../hooks/use-browse"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import type { Kind } from "@/lib/types"
import { useT } from "@/lib/i18n"
import { PagedGrid, Row, SourceBar, Tile } from "../ui"

/** Movies / TV Shows: title + category chip row; All = a compact row per category, Favorites = grid of wide tiles (a real category opens its own page). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const mode = useMode()
  const tile = (i: Parameters<typeof B.open>[0]) => <Tile key={i.id} item={i} pct={B.pct(i)} onOpen={() => B.open(i)} />
  return (
    <Shell page={B.page} title={B.kindLabel}>
      {B.status !== "ready" ? <Pending /> : (
        <div className="pv-page">
          <h1 className="pv-h1">{B.kindLabel}</h1>
          <Chips items={[ALL, FAV, ...B.groups]} active={B.g} locked={B.isLocked}
            onPick={(c) => { if (c === ALL || c === FAV) B.setG(c); else B.openCategory(c) }}
            onKey={(e, c) => { if (e.keyCode === KEY.yellow) B.toggleLock(c) }}
            onCtx={(e, c) => { if (mode !== "tv" && B.canLock && c !== FAV && c !== ALL) { e.preventDefault(); B.toggleLock(c) } }} />
          <SourceBar />
          {B.g === ALL ? (
            B.rails.length ? B.rails.map(([c, a]) => <Row key={c} title={c} onSeeAll={() => B.openCategory(c)}>{a.map(tile)}</Row>) : <div className="h-64"><Empty>{t("pv.nothing")}</Empty></div>
          ) : B.items.length ? <PagedGrid items={B.items} render={tile} /> : <div className="h-64"><Empty>{t("pv.nothing")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
