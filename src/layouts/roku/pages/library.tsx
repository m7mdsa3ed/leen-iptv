import { Card, SkelGrid } from "@/components/gtv"
import { Empty, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { useLibrary } from "../../hooks/use-library"
import { Grid, Page } from "../ui"

/** Library: Continue watching, Favorites and Recently watched as plain big grids. */
export default function Library() {
  const t = useT()
  const L = useLibrary()
  const sec = (title: string, list: Item[]) => list.length > 0 && (
    <section key={title}>
      <h2 className="rk-h">{title}</h2>
      <Grid>{list.map((i) => <Card key={i.id} fluid item={i} variant={i.kind === "live" ? "wide" : "poster"} pct={L.pct(i)} onOpen={() => L.open(i)} />)}</Grid>
    </section>
  )
  const empty = !L.favorites.length && !L.continueWatching.length && !L.history.length
  return (
    <Shell page="library" title={t("rk.library.title")}>
      <Page>
        <SourceFilter className="mb-2" />
        {L.status !== "ready" ? <SkelGrid /> : empty ? <div className="h-64"><Empty>{t("rk.library.empty")}</Empty></div> : (
          <>
            {sec(t("rk.library.continue"), L.continueWatching)}
            {sec(t("rk.library.favorites"), L.favorites)}
            {sec(t("rk.library.recent"), L.history)}
          </>
        )}
      </Page>
    </Shell>
  )
}
