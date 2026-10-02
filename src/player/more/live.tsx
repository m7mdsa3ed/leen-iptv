import { useMemo } from "react"
import { Star } from "lucide-react"
import { Card, Pill } from "@/components/gtv"
import { hm, nowNext, useCatalog } from "@/lib/catalog"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import type { MoreActions } from "./actions"
import { useGuard, useTick } from "./hooks"
import { Section } from "./parts"

const NONE: string[] = []
const MAX_CH = 80 // channels rendered around the current one (a category can hold hundreds)

/** Live channel: what is on, what is next (EPG), the other channels of the category (select = zap), favorite. */
export function LiveMore({ item, act }: { item: Item; act: MoreActions }) {
  const t = useT()
  useTick(30000)
  const epg = useCatalog((s) => s.epg)
  const live = useCatalog((s) => s.byKind.live)
  const favs = useApp((s) => (s.profileId && s.data[s.profileId]?.favs) || NONE)
  const toggleFav = useApp((s) => s.toggleFav)
  const guard = useGuard()
  const isFav = favs.includes(item.id)

  const list = item.epgId ? epg.get(item.epgId) : undefined
  const at = Date.now()
  const i = list ? list.findIndex((p) => p.e > at) : -1
  const now = list && i >= 0 && list[i].s <= at ? list[i] : undefined
  const from = now ? i + 1 : i
  const upcoming = list && i >= 0 ? list.slice(from, from + 6) : []

  const cat = useMemo(() => live.filter((c) => c.group === item.group), [live, item.group])
  const shown = useMemo(() => {
    const ci = Math.max(0, cat.findIndex((c) => c.id === item.id))
    const a = Math.max(0, Math.min(ci - 10, cat.length - MAX_CH))
    return cat.slice(a, a + MAX_CH)
  }, [cat, item.id])

  return (
    <>
      <Section title={t("player.more.now")}>
        {now ? (
          <div className="max-w-3xl">
            <div dir="auto" className="pl-lead">{now.t}</div>
            <div dir="ltr" data-ltr className="mt-1 text-sm text-muted-foreground">{hm(now.s)} - {hm(now.e)}</div>
            <div dir="ltr" data-ltr className="pl-progress mt-2"><div style={{ transform: `scaleX(${Math.min(1, Math.max(0, (at - now.s) / (now.e - now.s)))})` }} /></div>
            {now.d && <p dir="auto" className="mt-3 text-base leading-relaxed text-foreground/85">{now.d}</p>}
          </div>
        ) : <p className="text-base text-muted-foreground">{t("player.more.noGuide")}</p>}
        <div className="mt-4">
          <Pill data-autofocus="" className="pl-btn pl-act" onClick={() => toggleFav(item.id)}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} />{t(isFav ? "player.more.removeFav" : "player.more.addFav")}</Pill>
        </div>
      </Section>

      {upcoming.length > 0 && (
        <Section title={t("player.more.upNext")}>
          <ul className="max-w-3xl divide-y divide-white/10">
            {upcoming.map((p) => (
              <li key={p.s} className="flex gap-4 py-2.5">
                <span dir="ltr" className="w-28 shrink-0 text-muted-foreground">{hm(p.s)}</span>
                <span className="min-w-0"><span dir="auto" className="block">{p.t}</span>{p.d && <span dir="auto" className="line-clamp-1 block text-sm text-muted-foreground">{p.d}</span>}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {shown.length > 1 && (
        <Section title={t("player.more.channels", { group: item.group || t("common.other") })}>
          <div data-nav-group className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
            {shown.map((c) => {
              const cur = c.id === item.id
              const on = nowNext(epg, c.epgId).now
              return <Card key={c.id} item={c} variant="wide" fluid className={cur ? "pl-cur" : ""} sub={cur ? t("player.more.playing") : on?.t} onOpen={() => (cur ? act.close() : guard(c, () => act.play(c, cat, true)))} />
            })}
          </div>
        </Section>
      )}
    </>
  )
}
