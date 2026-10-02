import { useCallback, useEffect, useRef } from "react"
import { Play, Star } from "lucide-react"
import { GuideGrid } from "@/components/GuideGrid"
import { Empty, Logo, Shell, useK } from "@/components/tv/ui"
import { progressPct, useLive } from "../hooks/use-live"
import { fmt, useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"

/** Live TV home: preview of the focused channel (now/next, Play, favourite) above the programme guide (its own category chips). */
export default function Home() {
  const t = useT()
  const k = useK()
  const L = useLive()
  const { channels, sel, setSel, now, next, status } = L
  const cur = sel ?? channels[0] ?? null
  const live = useRef(L)
  live.current = L
  const onOpen = useCallback((ch: Item, list: Item[]) => live.current.open(ch, list), [])
  const onFocusProg = useCallback((ch: Item) => live.current.setSel(ch), [])
  useEffect(() => { if (!sel && channels[0]) setSel(channels[0]) }, [sel, channels, setSel])
  const n = cur && cur === sel ? now : cur ? L.nowOf(cur).now : undefined
  const nx = cur && cur === sel ? next : cur ? L.nowOf(cur).next : undefined
  const fav = cur ? L.isFav(cur) : false
  return (
    <Shell page="home" title={t("lv.home.title")}>
      <div className="flex h-full min-h-[34rem] flex-col gap-3 pb-2">
        {status === "ready" && !channels.length ? <Empty>{t("lv.home.empty")}</Empty> : (
          <>
            {cur && (
              <section className="lv-prev">
                <Logo item={cur} className="shrink-0 rounded-2xl bg-surface-2 p-2" />
                <div className="min-w-0 flex-1">
                  <div dir="auto" className="flex items-center gap-2 text-base text-muted-foreground"><span aria-hidden className="lv-live" />{cur.num != null && <span>{fmt.number(Number(cur.num))}</span>}<span className="truncate">{cur.name}</span></div>
                  <div dir="auto" className="truncate text-2xl font-semibold" style={{ lineHeight: 1.3 }}>{n ? n.t : t("lv.home.noGuide")}</div>
                  {n && (
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span dir="ltr" data-ltr>{fmt.time(n.s)} - {fmt.time(n.e)}</span>
                      <div dir="ltr" data-ltr className="lv-bar w-40"><div style={{ width: `${progressPct(n.s, n.e)}%` }} /></div>
                    </div>
                  )}
                  {nx && <div dir="auto" className="mt-1 truncate text-sm text-muted-foreground">{t("lv.home.next", { title: nx.t })}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <button data-nav data-autofocus="" onClick={() => L.open(cur, channels)} className="lv-btn lv-play"><Play className="size-5 fill-current" />{t("lv.home.play")}</button>
                  <button data-nav aria-pressed={fav} aria-label={fav ? t("lv.home.unfav") : t("lv.home.fav")} onClick={() => L.toggleFav(cur)} className="lv-btn"><Star className={fav ? "size-5 fill-yellow-400 text-yellow-400" : "size-5"} />{fav ? t("lv.home.unfav") : t("lv.home.fav")}</button>
                </div>
              </section>
            )}
            <div className="min-h-0 flex-1" style={{ minHeight: 280 * k }}><GuideGrid onOpen={onOpen} onFocusProg={onFocusProg} /></div>
          </>
        )}
      </div>
    </Shell>
  )
}
