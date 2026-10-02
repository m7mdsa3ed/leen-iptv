import { Star, Tv } from "lucide-react"
import { GroupList } from "@/components/tv/groups"
import { Empty, Logo, Pending, Shell, VList } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { hm } from "@/lib/catalog"
import { fmt, useT } from "@/lib/i18n"
import { KEY, useRoute } from "@/lib/nav"
import { progressPct, useLive } from "../../hooks/use-live"
import { Opt, Split, useSeed } from "../parts"

/** Live wall: channel list with now/next on the left, the detail pane (now/next, description) on the right. */
export default function Live() {
  const L = useLive()
  const t = useT()
  const go = useRoute((s) => s.go)
  useSeed(L.items)
  return (
    <Shell page="live" title={t("pw.live.title")}>
      {L.status !== "ready" ? <Pending shape="grid" /> : (
        <Split bar={<>
          <div className="flex items-center gap-2"><Opt onClick={() => go("guide")}><Tv />{t("pw.live.guide")}</Opt></div>
          <SourceFilter />
          <GroupList kind="live" groups={L.groups} active={L.g} onPick={L.setG} />
        </>}>
          {L.items.length ? (
            <VList items={L.items} rowH={76} render={(i) => {
              const { now: n, next: nx } = L.nowOf(i)
              return (
                <button key={i.id} data-nav data-id={i.id} onClick={() => L.open(i, L.items)} onKeyDown={(e) => e.keyCode === KEY.red && L.toggleFav(i)} className="pw-row">
                  <Logo item={i} className="size-14 shrink-0 rounded-lg p-1" />
                  <span dir="ltr" data-ltr className="w-10 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{i.num ?? ""}</span>
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="flex items-center gap-2 truncate text-base font-medium">{i.name}{L.isFav(i) && <Star className="size-4 shrink-0 fill-yellow-400 text-yellow-400" />}</span>
                    <span dir="auto" className="block truncate text-sm text-muted-foreground">{n ? `${hm(n.s)} ${n.t}` : t("pw.live.noEpg")}{nx ? ` · ${fmt.time(nx.s)} ${nx.t}` : ""}</span>
                    {n && <span dir="ltr" data-ltr className="mt-1 block h-1 overflow-hidden rounded-full bg-[var(--fg-10)]"><span className="block h-full bg-accent-blue" style={{ width: `${progressPct(n.s, n.e)}%` }} /></span>}
                  </span>
                </button>
              )
            }} />
          ) : <Empty>{t("pw.live.none")}</Empty>}
        </Split>
      )}
    </Shell>
  )
}
