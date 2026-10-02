import { Clapperboard, Film, Heart, Tv, type LucideIcon } from "lucide-react"
import { Empty, Logo, Shell, TvButton } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { useHomeData } from "../home-data"
import { Page } from "./ui"

/** Home = Roku channel grid: 4:3 tiles (Live TV, Movies, TV Shows, Favorites first, then continue / favorites / recent / live as artwork tiles). */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const go = useRoute((s) => s.go)
  const cats: { c: number; icon: LucideIcon; label: string; to: string }[] = [
    { c: 1, icon: Tv, label: t("rk.menu.live"), to: "live" },
    { c: 2, icon: Film, label: t("rk.menu.movies"), to: "movies" },
    { c: 3, icon: Clapperboard, label: t("rk.menu.shows"), to: "series" },
    { c: 4, icon: Heart, label: t("rk.menu.favorites"), to: "library" },
  ]
  const seen = new Set<string>()
  const items: Item[] = []
  for (const k of ["cont", "favs", "recents", "live"]) for (const i of h.rails.find((r) => r.key === k)?.items ?? []) if (!seen.has(i.id) && items.length < 24) { seen.add(i.id); items.push(i) }
  return (
    <Shell page="home" title={t("rk.menu.home")}>
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("rk.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("rk.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status !== "error" && (
        <Page>
          {h.status !== "ready" && <div role="status" className="rk-status">{h.msg}...</div>}
          <div className="rk-tiles">
            {cats.map((x, i) => (
              <button key={x.c} data-nav data-autofocus={i === 0 ? "" : undefined} onClick={() => go(x.to)} className="rk-tile rk-tile-cat" data-c={x.c}>
                <x.icon aria-hidden className="rk-tile-ico" />
                <span dir="auto" className="rk-tile-label">{x.label}</span>
              </button>
            ))}
            {items.map((i) => (
              <button key={i.id} data-nav data-card data-id={i.id} onClick={() => h.open(i, h.live)} className="rk-tile">
                <Logo item={i} className="rk-tile-art" />
                <span dir="auto" className="rk-tile-name">{i.name}</span>
              </button>
            ))}
          </div>
        </Page>
      )}
    </Shell>
  )
}
