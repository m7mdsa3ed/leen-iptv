import { useDeferredValue, useMemo, useState } from "react"
import { Search as SearchIcon, X } from "lucide-react"
import { Card, Rail } from "@/components/gtv"
import { Empty, Shell, useOpen } from "@/components/tv/ui"
import { isTv } from "@/lib/device"
import { useCatalog } from "@/lib/catalog"

export default function Search() {
  const items = useCatalog((s) => s.items)
  const open = useOpen()
  const [q, setQ] = useState("")
  const dq = useDeferredValue(q).trim().toLowerCase()
  const res = useMemo(() => (dq.length < 2 ? [] : items.filter((i) => i.name.toLowerCase().includes(dq)).slice(0, 300)), [dq, items])
  const live = useMemo(() => res.filter((i) => i.kind === "live"), [res])
  const movies = useMemo(() => res.filter((i) => i.kind === "movie"), [res])
  const series = useMemo(() => res.filter((i) => i.kind === "series"), [res])
  return (
    <Shell page="search" title="Search">
      <div className="flex h-full flex-col gap-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input data-nav autoFocus={!isTv} className="h-12 w-full rounded-full bg-surface-2 pl-14 pr-12 text-base text-foreground outline-none placeholder:text-muted-foreground md:h-14 md:text-xl [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:appearance-none" type="search" enterKeyHint="search" autoComplete="off" placeholder={isTv ? "Search channels, movies, series (press OK to type)" : "Search channels, movies, series"} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && !isTv && <button aria-label="Clear" onClick={() => setQ("")} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-5" /></button>}
        </div>
        <div className="min-h-0 flex-1">
          {res.length ? (
            <div className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar">
              {live.length > 0 && <Rail title="Live">{live.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i, live)} />)}</Rail>}
              {movies.length > 0 && <Rail title="Movies">{movies.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
              {series.length > 0 && <Rail title="Series">{series.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
            </div>
          ) : <Empty>{dq.length < 2 ? "Type at least 2 letters" : "No results"}</Empty>}
        </div>
      </div>
    </Shell>
  )
}
