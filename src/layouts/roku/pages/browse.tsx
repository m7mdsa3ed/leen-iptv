import { Play } from "lucide-react"
import { Card, Rail, SkelGrid } from "@/components/gtv"
import { Chips, Empty, Shell } from "@/components/tv/ui"
import { SourceFilter } from "@/components/source/SourceFilter"
import { useT } from "@/lib/i18n"
import type { Kind } from "@/lib/types"
import { KEY } from "@/lib/nav"
import { ALL, FAV, useBrowse } from "../../hooks/use-browse"
import { Page, Paged } from "../ui"

/** Movies / Shows, Roku Channel style: hero banner, category chips, then rails of poster tiles (Favorites chip = grid). */
export default function Browse({ kind }: { kind: Exclude<Kind, "live"> }) {
  const B = useBrowse(kind)
  const t = useT()
  const hero = B.status === "ready" && B.g === ALL ? B.rails.flatMap(([, l]) => l).find((i) => i.logo) : undefined
  return (
    <Shell page={B.page} title={B.kindLabel}>
      <Page>
        {B.status !== "ready" ? <SkelGrid /> : (
          <>
            {hero && (
              <section className="rk-hero">
                <img src={hero.logo} alt="" className="rk-hero-img" />
                <div className="rk-hero-body">
                  <h2 dir="auto" className="rk-hero-title">{hero.name}</h2>
                  {hero.group && <div dir="auto" className="rk-hero-sub">{hero.group}</div>}
                  <button data-nav onClick={() => B.open(hero)} className="rk-play"><Play className="fill-current" />{t("common.play")}</button>
                </div>
              </section>
            )}
            <SourceFilter className="mb-2" />
            <Chips items={[ALL, FAV, ...B.groups.slice(0, 40)]} active={B.g} onPick={B.setG} locked={B.isLocked}
              onKey={(e, c) => { if (e.keyCode === KEY.yellow) B.toggleLock(c) }} />
            {B.g === ALL ? (
              B.rails.length ? B.rails.map(([cat, list]) => (
                <Rail key={cat} title={cat} onSeeAll={() => B.openCategory(cat)}>
                  {list.map((i) => <Card key={i.id} item={i} pct={B.pct(i)} onOpen={() => B.open(i)} />)}
                </Rail>
              )) : <div className="h-64"><Empty>{t("rk.nothing")}</Empty></div>
            ) : B.items.length ? (
              <Paged items={B.items} render={(i) => <Card key={i.id} fluid item={i} pct={B.pct(i)} onOpen={() => B.open(i)} />} />
            ) : <div className="h-64"><Empty>{t(B.g === FAV ? "rk.nothingFav" : "rk.nothing")}</Empty></div>}
          </>
        )}
      </Page>
    </Shell>
  )
}
