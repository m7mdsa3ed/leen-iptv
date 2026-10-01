import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Card, Pill, RoundButton } from "@/components/gtv"
import { Empty, Pending, Shell, VGrid, askPin } from "@/components/tv/ui"
import { Input } from "@/components/ui/input"
import { useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { useRoute } from "@/lib/nav"
import { usePData, useProfile } from "@/lib/store"
import type { Item } from "@/lib/types"

type Sort = "default" | "az" | "rating"
const SORTS: [Sort, string][] = [["default", "Default"], ["az", "A-Z"], ["rating", "Top rated"]]

/** Every title of one category, as its own page. Route id = `${kind}|${category}`. */
export default function CategoryPage({ id }: { id: string }) {
  const cut = id.indexOf("|")
  const kind = (id.slice(0, cut) === "series" ? "series" : "movie") as "movie" | "series"
  const group = id.slice(cut + 1)
  const { byKind, status } = useCatalog()
  const d = usePData()
  const p = useProfile()
  const go = useRoute((s) => s.go)
  const back = useRoute((s) => s.back)
  const locked = !!p?.pin && p.locked.includes(`${kind}|${group}`)
  const [ok, setOk] = useState(!locked) // locked categories need the PIN even when reached by URL or refresh
  const [sort, setSort] = useState<Sort>("default")
  const [q, setQ] = useState("")

  useEffect(() => {
    if (ok || !p?.pin) return
    void askPin(p.pin).then((good) => (good ? setOk(true) : back()))
  }, [ok, p?.pin, back])

  const all = useMemo(() => byKind[kind].filter((i) => i.group === group), [byKind, kind, group])
  const hasRating = useMemo(() => all.some((i) => parseFloat(i.rating ?? "") > 0), [all])
  const items = useMemo(() => {
    const f = q.trim().toLowerCase()
    const l = f ? all.filter((i) => i.name.toLowerCase().includes(f)) : all
    if (sort === "az") return [...l].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === "rating") return [...l].sort((a, b) => (parseFloat(b.rating ?? "") || 0) - (parseFloat(a.rating ?? "") || 0))
    return l
  }, [all, q, sort])
  const pct = (i: Item) => d.progress[i.id] && (d.progress[i.id].pos / d.progress[i.id].dur) * 100

  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={group}>
      {status !== "ready" ? <Pending /> : !ok ? null : (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
            <div className="mr-auto min-w-0">
              <h2 className="truncate text-3xl font-medium tracking-tight">{group}</h2>
              <div className="text-sm text-muted-foreground">{items.length === all.length ? `${all.length} titles` : `${items.length} of ${all.length} titles`}</div>
            </div>
            {SORTS.filter(([s]) => s !== "rating" || hasRating).map(([s, label]) => (
              <Pill key={s} variant={sort === s ? "primary" : "tonal"} onClick={() => setSort(s)}>{label}</Pill>
            ))}
            <Input data-nav className="h-11 w-48 rounded-full text-base focus-visible:ring-0 md:w-64 [html[data-mode=mobile]_&]:text-[16px]" type="search" autoComplete="off" placeholder="Filter this category" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1">
            {items.length ? <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => go("detail", { id: i.id })} />} /> : <Empty>Nothing matches</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
