import { Clapperboard, Film, Heart, History, PlayCircle, Search, Settings, Tv, Users, type LucideIcon } from "lucide-react"
import { Empty, Shell, TvButton } from "@/components/tv/ui"
import { useRoute } from "@/lib/nav"
import { useT } from "@/lib/i18n"
import { useHomeData } from "../home-data"
import { Page } from "./ui"

/** Home = a grid of big colourful tiles (icon + label). Continue watching only when there is something to resume. */
export default function Home() {
  const t = useT()
  const h = useHomeData()
  const go = useRoute((s) => s.go)
  const reset = useRoute((s) => s.reset)
  const cont = h.rails.find((r) => r.key === "cont")?.items[0]
  const tiles: { c: number; icon: LucideIcon; label: string; sub?: string; on: () => void }[] = [
    { c: 1, icon: Tv, label: t("rk.home.live"), on: () => go("live") },
    { c: 2, icon: Film, label: t("rk.home.movies"), on: () => go("movies") },
    { c: 3, icon: Clapperboard, label: t("rk.home.shows"), on: () => go("series") },
    { c: 4, icon: Heart, label: t("rk.home.favorites"), on: () => go("library") },
    ...(cont ? [{ c: 5, icon: PlayCircle, label: t("rk.home.continue"), sub: cont.name, on: () => h.open(cont) }] : []),
    { c: 6, icon: Search, label: t("rk.home.search"), on: () => go("search") },
    { c: 7, icon: History, label: t("rk.home.recent"), on: () => go("history") },
    { c: 8, icon: Settings, label: t("rk.home.settings"), on: () => go("settings") },
    { c: 9, icon: Users, label: t("rk.home.profile"), on: () => reset("profiles") },
  ]
  return (
    <Shell page="home" title={t("rk.home.title")}>
      {h.status === "error" && (
        <Empty><div className="flex flex-col items-center gap-4"><div className="text-destructive">{h.msg}</div>
          <div className="flex gap-3"><TvButton onClick={h.retry}>{t("rk.home.retry")}</TvButton><TvButton variant="secondary" onClick={h.changeSource}>{t("rk.home.changeSource")}</TvButton></div></div></Empty>
      )}
      {h.status !== "error" && (
        <Page>
          {h.status !== "ready" && <div role="status" className="rk-status">{h.msg}...</div>}
          <div className="rk-tiles">
            {tiles.map((x, i) => (
              <button key={x.c} data-nav data-autofocus={i === 0 ? "" : undefined} onClick={x.on} className="rk-tile" data-c={x.c}>
                <x.icon aria-hidden className="rk-tile-ico" />
                <span dir="auto" className="rk-tile-label">{x.label}</span>
                {x.sub && <span dir="auto" className="rk-tile-sub">{x.sub}</span>}
              </button>
            ))}
          </div>
        </Page>
      )}
    </Shell>
  )
}
