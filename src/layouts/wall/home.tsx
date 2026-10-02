import { useMemo, useState } from "react"
import { Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { useCatalogView } from "../hooks/use-source-filter"
import { Opt, PosterGrid, Split } from "./parts"
import { Pending } from "@/components/tv/ui"
import type { Item } from "@/lib/types"

type Sec = "all" | "cont" | "added" | "favs"

/** Home wall: Continue watching + Recently added + Favorites in one grid, section chips filter it. */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const { byKind } = useCatalogView()
  const [sec, setSec] = useState<Sec>("all")
  const cont = h.rails.find((r) => r.key === "cont")
  const favs = h.rails.find((r) => r.key === "favs")
  // newest additions (catalog order, last = newest)
  const added = useMemo(() => [...byKind.movie.slice(-20), ...byKind.series.slice(-20)].reverse(), [byKind])
  const lists: [Sec, Item[]][] = [["cont", cont?.items ?? []], ["added", added], ["favs", favs?.items ?? []]]
  const shown = useMemo(() => {
    const seen = new Set<string>()
    const on = lists.some(([k, l]) => k === sec && l.length) ? sec : "all" // a vanished section falls back to All
    return lists.filter(([k]) => on === "all" || k === on).flatMap(([, l]) => l).filter((i) => !seen.has(i.id) && !!seen.add(i.id))
  }, [sec, cont, favs, added]) // eslint-disable-line react-hooks/exhaustive-deps
  const chips = [["all", t("pw.sec.all")] as const, ...lists.filter(([, l]) => l.length).map(([k]) => [k, t(`pw.sec.${k}`)] as const)]
  const active: Sec = chips.some(([k]) => k === sec) ? sec : "all"
  return (
    <Shell page="home" title={h.sourceName ?? t("pw.home.title")}>
      {h.status !== "ready" ? <Pending shape="grid" /> : (
        <Split bar={<>
          <div data-nav-group className="flex flex-wrap items-center gap-2">{chips.map(([k, l]) => <Opt key={k} on={k === active} onClick={() => setSec(k)}>{l}</Opt>)}</div>
          <SourceFilter />
        </>}>
          <PosterGrid items={shown} pct={cont?.pct} onOpen={(i) => h.open(i, shown)} empty={t("pw.home.empty")} />
        </Split>
      )}
    </Shell>
  )
}
