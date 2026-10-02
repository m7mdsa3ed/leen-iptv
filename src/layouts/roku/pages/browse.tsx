import { Card, SkelGrid } from "@/components/gtv"
import { Chips, Empty, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useT } from "@/lib/i18n"
import type { Kind } from "@/lib/types"
import { KEY } from "@/lib/nav"
import { ALL, FAV, useBrowse } from "../../hooks/use-browse"
import { useCatalogView } from "../../hooks/use-source-filter"
import { Page, Paged } from "../ui"

/** Movies / Shows: category chip row over a plain big poster grid (Favorites chip = this kind's favorites). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const view = useCatalogView()
  const list = B.g === ALL ? view.byKind[kind] : B.items
  return (
    <Shell page={B.page} title={B.kindLabel}>
      <Page>
        <h2 className="rk-h">{B.kindLabel}</h2>
        {B.status !== "ready" ? <SkelGrid /> : (
          <>
            <SourceFilter className="mb-2" />
            <Chips items={[ALL, FAV, ...B.groups.slice(0, 40)]} active={B.g} onPick={B.setG} locked={B.isLocked}
              onKey={(e, c) => { if (e.keyCode === KEY.yellow) B.toggleLock(c) }} />
            {list.length ? (
              <Paged items={list} render={(i) => <Card key={i.id} fluid item={i} pct={B.pct(i)} onOpen={() => B.open(i)} />} />
            ) : <div className="h-64"><Empty>{t(B.g === FAV ? "rk.nothingFav" : "rk.nothing")}</Empty></div>}
          </>
        )}
      </Page>
    </Shell>
  )
}
