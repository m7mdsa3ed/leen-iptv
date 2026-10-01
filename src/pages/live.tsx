import { useMemo, useState } from "react"
import { Star } from "lucide-react"
import { ALL, FAV, GroupList } from "@/components/tv/groups"
import { Empty, Logo, Shell, VGrid, useOpen, Pending, useK } from "@/components/tv/ui"
import { hm, nowNext, useCatalog } from "@/lib/catalog"
import { useMode } from "@/lib/device"
import { KEY } from "@/lib/nav"
import { useApp, usePData } from "@/lib/store"
import type { Item } from "@/lib/types"

const pct = (s: number, e: number) => Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100))

export default function Live() {
  const { byKind, groups, status, epg } = useCatalog()
  const d = usePData()
  const toggleFav = useApp((s) => s.toggleFav)
  const open = useOpen()
  const mode = useMode()
  const k = useK()
  const [g, setG] = useState(ALL)
  const [sel, setSel] = useState<Item | null>(null)
  const items = useMemo(() => (g === ALL ? byKind.live : g === FAV ? byKind.live.filter((i) => d.favs.includes(i.id)) : byKind.live.filter((i) => i.group === g)), [g, byKind, d.favs])
  const { now, next } = sel ? nowNext(epg, sel.epgId) : ({} as ReturnType<typeof nowNext>)
  const cellH = 84

  return (
    <Shell page="live" title="Live TV">
      {status !== "ready" ? <Pending /> : (
        <div className="flex h-full flex-col gap-3">
          <GroupList kind="live" groups={groups.live} active={g} onPick={setG} />
          <div className="flex min-h-[5.5rem] shrink-0 items-center gap-4 rounded-3xl bg-surface p-3 pr-5">
            {sel ? (
              <>
                <Logo item={sel} className="size-16 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xl font-medium"><span className="mr-2 text-muted-foreground">{sel.num}</span>{sel.name}</div>
                  {now ? (
                    <>
                      <div className="truncate text-base">{now.t} <span className="text-muted-foreground">{hm(now.s)} - {hm(now.e)}{next ? ` · Next ${hm(next.s)} ${next.t}` : ""}</span></div>
                      <div className="mt-1 h-1 rounded-full bg-foreground/15"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${pct(now.s, now.e)}%` }} /></div>
                      {now.d && mode !== "mobile" && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{now.d}</p>}
                    </>
                  ) : <div className="text-base text-muted-foreground">No guide data</div>}
                </div>
              </>
            ) : <div className="px-2 text-muted-foreground">{mode === "tv" ? "Select a channel - Red: favorite" : "Select a channel"}</div>}
          </div>
          <div className="min-h-0 flex-1">
            {items.length ? (
              <VGrid items={items} ratio={0} label={cellH} minW={mode === "tv" ? 340 : 280} render={(i) => {
                const n = nowNext(epg, i.epgId).now
                return (
                  <button key={i.id} data-nav onFocus={() => setSel(i)} onMouseEnter={() => mode !== "tv" && setSel(i)} onClick={() => open(i, items)} onKeyDown={(e) => e.keyCode === KEY.red && toggleFav(i.id)} onContextMenu={(e) => { if (mode !== "tv") { e.preventDefault(); toggleFav(i.id) } }}
                    style={{ height: cellH * k }}
                    className="flex min-w-0 items-center gap-3 rounded-2xl bg-surface-2 p-2.5 pr-4 text-left">
                    <Logo item={i} className="aspect-video h-full shrink-0 rounded-xl bg-surface-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-muted-foreground">{i.num}</span>
                      <span className="block truncate text-base font-medium">{i.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">{n ? n.t : "No guide data"}</span>
                      {n && <span className="mt-1 block h-1 rounded-full bg-foreground/15"><span className="block h-full rounded-full bg-accent-blue" style={{ width: `${pct(n.s, n.e)}%` }} /></span>}
                    </span>
                    {d.favs.includes(i.id) && <Star className="size-5 shrink-0 fill-yellow-400 text-yellow-400" />}
                  </button>
                )
              }} />
            ) : <Empty>No channels</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
