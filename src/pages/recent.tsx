import { Card } from "@/components/gtv"
import { GRail, useLeft } from "@/layouts/googletv/parts"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useLibrary } from "@/layouts/hooks/use-library"
import { useT } from "@/lib/i18n"

export default function Recent() {
  const t = useT()
  const L = useLibrary()
  const { status, continueWatching, history, pct, open } = L
  const left = useLeft()
  return (
    <Shell page="recent" title={t("pages.recent.title")}>
      <div className="under-top under-bottom no-scrollbar -mx-[var(--gx)] overflow-y-auto px-[var(--gx)]">
        <SourceFilter className="mb-2" />
        {status !== "ready" ? <Pending shape="rails" /> : (
          <>
            {continueWatching.length > 0 && <GRail title={t("pages.recent.continue")}>{continueWatching.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} pct={pct(i)} sub={left(i)} onOpen={() => open(i)} />)}</GRail>}
            {history.length > 0 && <GRail title={t("pages.recent.history")}>{history.map((i) => <Card key={i.id} item={i} variant={i.kind === "live" ? "wide" : "poster"} pct={pct(i)} onOpen={() => open(i)} />)}</GRail>}
            {!continueWatching.length && !history.length && <div className="h-48"><Empty>{t("pages.recent.empty")}</Empty></div>}
          </>
        )}
      </div>
    </Shell>
  )
}
