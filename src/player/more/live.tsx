import { useMemo } from "react"
import { Star } from "lucide-react"
import { Card, Pill } from "@/components/gtv"
import { useCatalog } from "@/lib/catalog"
import { useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import type { MoreActions } from "./actions"
import { useGuard, useTick } from "./hooks"
import { Section } from "./parts"

const NONE: string[] = []
const MAX_CH = 80 // channels rendered around the current one (a category can hold hundreds)

/** Live channel: the favorite toggle and the other channels of the category (select = zap). */
export function LiveMore({ item, act }: { item: Item; act: MoreActions }) {
  const t = useT()
  useTick(30000)
  const live = useCatalog((s) => s.byKind.live)
  const favs = useApp((s) => (s.profileId && s.data[s.profileId]?.favs) || NONE)
  const toggleFav = useApp((s) => s.toggleFav)
  const guard = useGuard()
  const isFav = favs.includes(item.id)

  const cat = useMemo(() => live.filter((c) => c.group === item.group), [live, item.group])
  const shown = useMemo(() => {
    const ci = Math.max(0, cat.findIndex((c) => c.id === item.id))
    const a = Math.max(0, Math.min(ci - 10, cat.length - MAX_CH))
    return cat.slice(a, a + MAX_CH)
  }, [cat, item.id])

  return (
    <>
      <Section title={item.name}>
        <Pill data-autofocus="" className="pl-btn pl-act" onClick={() => toggleFav(item.id)}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} />{t(isFav ? "player.more.removeFav" : "player.more.addFav")}</Pill>
      </Section>

      {shown.length > 1 && (
        <Section title={t("player.more.channels", { group: item.group || t("common.other") })}>
          <div data-nav-group className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(10.5rem,1fr))]">
            {shown.map((c) => {
              const cur = c.id === item.id
              return <Card key={c.id} item={c} variant="wide" fluid className={cur ? "pl-cur" : ""} sub={cur ? t("player.more.playing") : undefined} onOpen={() => (cur ? act.close() : guard(c, () => act.play(c, cat, true)))} />
            })}
          </div>
        </Section>
      )}
    </>
  )
}
