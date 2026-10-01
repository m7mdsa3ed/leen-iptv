import { ArrowLeft } from "lucide-react"
import { Card, Pill, RoundButton } from "@/components/gtv"
import { Empty, Pending, Shell, VGrid } from "@/components/tv/ui"
import { Input } from "@/components/ui/input"
import { useCategory } from "@/layouts/hooks/use-category"
import { isTv } from "@/lib/device"

/** Every title of one category, as its own page. Route id = `${kind}|${category}`. */
export default function CategoryPage({ id }: { id: string }) {
  const { kind, group, status, ok, all, items, sort, setSort, sorts, q, setQ, back, pct, open } = useCategory(id)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={group}>
      {status !== "ready" ? <Pending /> : !ok ? null : (
        <div className="flex h-full flex-col">
          <div className="m-rise flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label="Back" onClick={back}><ArrowLeft /></RoundButton>}
            <div className="mr-auto min-w-0">
              <h2 className="truncate text-[1.4rem] font-normal">{group}</h2>
              <div className="text-sm text-muted-foreground">{items.length === all.length ? `${all.length} titles` : `${items.length} of ${all.length} titles`}</div>
            </div>
            {sorts.map(([s, label]) => (
              <Pill key={s} variant={sort === s ? "primary" : "tonal"} onClick={() => setSort(s)}>{label}</Pill>
            ))}
            <Input data-nav className="h-11 w-48 rounded-full text-base focus-visible:ring-0 md:w-64 [html[data-mode=mobile]_&]:text-[16px]" type="search" autoComplete="off" placeholder="Filter this category" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="m-fade min-h-0 flex-1" style={{ "--i": 1 } as React.CSSProperties}>
            {items.length ? <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => open(i)} />} /> : <Empty>Nothing matches</Empty>}
          </div>
        </div>
      )}
    </Shell>
  )
}
