import { useMemo } from "react"
import { Tv } from "lucide-react"
import { Empty, Shell } from "@/components/tv/ui"
import { useT, fmt } from "@/lib/i18n"
import { ALL, FAV, progressPct, useLive } from "../../hooks/use-live"
import { useRoute } from "@/lib/nav"
import type { Item } from "@/lib/types"
import { Dropdown, DropLabel, PagedGrid, Pick, Row, SkelRows, SourceBar, Tile } from "../ui"

const MAX_ROWS = 30
const PER_ROW = 20

/** Live: rows of 16:9 channel tiles by category (now playing under the name, red programme progress); a category pick shows its channels as a grid. */
export default function Live() {
  const L = useLive()
  const t = useT()
  const label = (c: string) => (c === FAV ? t("nf.myList") : c === ALL ? t("nf.all") : c)
  const go = useRoute((s) => s.go)
  const rows = useMemo(() => {
    const by = new Map<string, Item[]>()
    for (const i of L.channels) { const a = by.get(i.group); if (!a) by.set(i.group, [i]); else if (a.length < PER_ROW) a.push(i) }
    return L.groups.slice(0, MAX_ROWS).map((g) => [g, by.get(g) ?? []] as const).filter(([, a]) => a.length)
  }, [L.channels, L.groups])
  const tile = (i: Item, queue: Item[], fluid?: boolean) => {
    const n = L.nowOf(i).now
    return <Tile key={i.id} item={i} variant="wide" fluid={fluid} pct={n ? progressPct(n.s, n.e) : undefined} sub={n ? `${fmt.time(n.s)} ${n.t}` : t("nf.live")} onOpen={() => L.open(i, queue)} />
  }
  return (
    <Shell page="live" title={t("nf.live.title")}>
      {L.status !== "ready" ? <SkelRows /> : (
        <div className="nf-page">
          <div className="nf-strip">
            <h1 className="nf-h1">{t("nf.live.title")}</h1>
            <Dropdown className="nf-drop" panelClass="w-[min(34rem,calc(100vw-2rem))]" trigger={<DropLabel>{L.g === ALL ? t("nf.live.categories") : label(L.g)}</DropLabel>}>
              {(close) => (
                <div className="grid grid-cols-2 sm:grid-cols-3">
                  {[ALL, FAV, ...L.groups].map((c) => <Pick key={c} active={c === L.g} onClick={() => { close(); L.setG(c) }}><span dir="auto" className="truncate">{label(c)}</span></Pick>)}
                </div>
              )}
            </Dropdown>
            <button data-nav onClick={() => go("guide")} className="nf-drop"><Tv className="size-4" />{t("nf.live.guide")}</button>
          </div>
          <SourceBar />
          {L.g === ALL ? (
            rows.length ? rows.map(([g, a]) => <Row key={g} title={g} onSeeAll={() => L.setG(g)}>{a.map((i) => tile(i, a))}</Row>) : <div className="h-64"><Empty>{t("nf.live.none")}</Empty></div>
          ) : L.items.length ? (
            <PagedGrid variant="wide" items={L.items} render={(i) => tile(i, L.items, true)} />
          ) : <div className="h-64"><Empty>{t("nf.live.none")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
