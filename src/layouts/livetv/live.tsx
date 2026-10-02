import { useCallback, useEffect, useRef } from "react"
import { Play, Plus, Check } from "lucide-react"
import { GuideGrid } from "@/components/GuideGrid"
import { Empty, Logo, Shell, useK } from "@/components/tv/ui"
import { progressPct, useLive } from "../hooks/use-live"
import { fmt, useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"

/** YouTube TV "Live": recommendations on top, highlighted now-playing strip, then the condensed guide grid (channel logos left, time columns). */
export default function Live() {
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
  const left = n ? Math.max(0, Math.ceil((n.e - Date.now()) / 60000)) : 0
  return (
    <Shell page="live" title={t("lv.live.title")}>
      <div className="flex h-full min-h-[34rem] flex-col gap-3 pb-2">
        {status === "ready" && !channels.length ? <Empty>{t("lv.home.empty")}</Empty> : (
          <>
            <section aria-label={t("lv.live.onNow")} data-nav-group className="no-scrollbar -mx-3 flex shrink-0 gap-3 overflow-x-auto px-3 py-1">
              {channels.slice(0, 12).map((c) => {
                const p = L.nowOf(c).now
                return (
                  <button key={c.id} data-nav data-pill onClick={() => L.open(c, channels)} onFocus={() => setSel(c)} className="lv-rec">
                    <Logo item={c} className="lv-th p-1" />
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-base font-medium">{p ? p.t : c.name}</span>
                      <span dir="auto" className="block truncate text-sm opacity-70">{c.name}</span>
                    </span>
                    {p && <span dir="ltr" data-ltr className="lv-bar absolute inset-x-0 bottom-0 !rounded-none"><span className="block h-full bg-[#ff0000]" style={{ width: `${progressPct(p.s, p.e)}%` }} /></span>}
                  </button>
                )
              })}
            </section>
            {cur && (
              <section className="lv-prev">
                <Logo item={cur} className="size-12 shrink-0 rounded-lg bg-surface-3 p-1" />
                <div className="min-w-0 flex-1">
                  <div dir="auto" className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden className="lv-live" />{cur.num != null && <span>{fmt.number(Number(cur.num))}</span>}<span className="truncate">{cur.name}</span></div>
                  <div dir="auto" className="truncate text-xl font-medium">{n ? n.t : t("lv.home.noGuide")}</div>
                  {n && (
                    <div className="mt-0.5 flex items-center gap-3 text-sm text-muted-foreground">
                      <span dir="ltr" data-ltr>{fmt.time(n.s)} - {fmt.time(n.e)}</span>
                      <span>{t("lv.live.left", { n: fmt.number(left) })}</span>
                      <div dir="ltr" data-ltr className="lv-bar w-32"><div style={{ width: `${progressPct(n.s, n.e)}%` }} /></div>
                      {nx && <span dir="auto" className="hidden truncate lg:inline">{t("lv.home.next", { title: nx.t })}</span>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button data-nav data-pill onClick={() => L.open(cur, channels)} className="lv-btn lv-play"><Play className="size-5 fill-current" />{t("lv.home.play")}</button>
                  <button data-nav data-pill aria-pressed={fav} aria-label={fav ? t("lv.home.unfav") : t("lv.home.fav")} onClick={() => L.toggleFav(cur)} className="lv-btn">{fav ? <Check className="size-5" /> : <Plus className="size-5" />}{fav ? t("lv.live.inLibrary") : t("lv.live.addLibrary")}</button>
                </div>
              </section>
            )}
            <div className="min-h-0 flex-1" style={{ minHeight: 260 * k }}><GuideGrid onOpen={onOpen} onFocusProg={onFocusProg} /></div>
          </>
        )}
      </div>
    </Shell>
  )
}
