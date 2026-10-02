import { Card } from "@/components/gtv"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useT, fmt } from "@/lib/i18n"
import type { Kind } from "@/lib/types"
import { ALL, useBrowse } from "../../hooks/use-browse"
import { ALL as LALL, useLive } from "../../hooks/use-live"
import { useSafe } from "../safe"
import { KChips, KGrid } from "../ui"

/** Movies / Shows: allowed-category chips (a real category opens its page) + one big poster grid. */
export function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const safe = useSafe()
  const groups = B.groups.filter((c) => safe.group(kind, c))
  const items = B.rails.flatMap(([c, a]) => (safe.group(kind, c) ? a.filter(safe.item) : []))
  return (
    <Shell page={B.page} title={B.kindLabel}>
      {B.status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex flex-col gap-4 pb-8">
          <KChips items={[ALL, ...groups]} active={ALL} label={(c) => (c === ALL ? t("kd.all") : c)} onPick={(c) => c !== ALL && B.openCategory(c)} />
          {items.length ? <KGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={B.pct(i)} onOpen={() => B.open(i)} />} /> : <div className="h-64"><Empty>{t("kd.nothing")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}

/** Live: category chips + big channel tiles with logos (now playing underneath). */
export function Live() {
  const L = useLive()
  const t = useT()
  const safe = useSafe()
  const groups = L.groups.filter((c) => safe.group("live", c))
  const items = L.items.filter(safe.item)
  return (
    <Shell page="live" title={t("kd.live.title")}>
      {L.status !== "ready" ? <Pending shape="grid" /> : (
        <div className="flex flex-col gap-4 pb-8">
          <KChips items={[LALL, ...groups]} active={L.g} label={(c) => (c === LALL ? t("kd.all") : c)} onPick={L.setG} />
          {items.length ? <KGrid wide reset={L.g} items={items} render={(i) => { const n = L.nowOf(i).now; return <Card key={i.id} item={i} variant="wide" fluid sub={n ? `${fmt.time(n.s)} ${n.t}` : t("kd.live.tag")} onOpen={() => L.open(i, items)} /> }} /> : <div className="h-64"><Empty>{t("kd.nothing")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
