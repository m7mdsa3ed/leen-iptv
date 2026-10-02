import { Tv } from "lucide-react"
import { Pill, SkelBar } from "@/components/gtv"
import { Chips, Empty, Logo, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { fmt, useT } from "@/lib/i18n"
import { useRoute } from "@/lib/nav"
import { ALL, FAV, progressPct, useLive } from "../../hooks/use-live"
import { Page, Paged } from "../ui"

/** Live: category chips over a big channel list (logo, name, now with progress, next). */
export default function Live() {
  const L = useLive()
  const t = useT()
  const go = useRoute((s) => s.go)
  return (
    <Shell page="live" title={t("rk.live.title")}>
      <Page>
        <div className="flex items-center gap-4"><h2 className="rk-h me-auto">{t("rk.live.title")}</h2>
          <Pill onClick={() => go("guide")}><Tv />{t("rk.live.guide")}</Pill></div>
        {L.status !== "ready" ? <div className="space-y-3 py-4"><SkelBar className="h-20 w-full" /><SkelBar className="h-20 w-full" /><SkelBar className="h-20 w-full" /></div> : (
          <>
            <SourceFilter className="mb-2" />
            <Chips items={[ALL, FAV, ...L.groups.slice(0, 40)]} active={L.g} onPick={L.setG} />
            {L.items.length ? (
              <Paged grid={false} items={L.items} render={(i) => {
                const { now, next } = L.nowOf(i)
                return (
                  <button key={i.id} data-nav data-pill onClick={() => L.open(i)} className="rk-ch">
                    <Logo item={i} className="rk-ch-logo" />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-2xl font-bold">{i.name}</span>
                      {now ? <span dir="auto" className="block truncate text-lg opacity-80">{fmt.time(now.s)} {now.t}</span> : <span className="block text-lg opacity-60">{t("rk.live.noEpg")}</span>}
                      {now && <span dir="ltr" className="rk-bar"><span style={{ width: `${progressPct(now.s, now.e)}%` }} /></span>}
                      {next && <span dir="auto" className="block truncate text-base opacity-60">{t("rk.live.next", { time: fmt.time(next.s), title: next.t })}</span>}
                    </span>
                  </button>
                )
              }} />
            ) : <div className="h-64"><Empty>{t("rk.live.none")}</Empty></div>}
          </>
        )}
      </Page>
    </Shell>
  )
}
