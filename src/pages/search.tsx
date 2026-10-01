import { Search as SearchIcon, X } from "lucide-react"
import { Card, Rail } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { Empty, Shell } from "@/components/tv/ui"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { useSearch } from "@/layouts/hooks/use-search"

export default function Search() {
  const { q, setQ, tooShort, results: res, live, movies, series, open } = useSearch()
  const t = useT()
  return (
    <Shell page="search" title={t("pages.search.title")}>
      <div className="flex h-full flex-col gap-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute start-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input data-nav dir="auto" autoFocus={!isTv} className="h-12 w-full rounded-full bg-surface-2 ps-14 pe-12 text-base text-foreground outline-none placeholder:text-muted-foreground md:h-14 md:text-xl [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:appearance-none" type="search" enterKeyHint="search" autoComplete="off" placeholder={isTv ? t("pages.search.placeholderTv") : t("pages.search.placeholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && !isTv && <button aria-label={t("pages.search.clear")} onClick={() => setQ("")} className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-5" /></button>}
        </div>
        <SourceFilter className="-mt-2" />
        <div className="min-h-0 flex-1">
          {res.length ? (
            <div className="-mx-[var(--gx)] h-full overflow-y-auto px-[var(--gx)] no-scrollbar">
              {live.length > 0 && <Rail title={t("pages.search.live")}>{live.map((i) => <Card key={i.id} item={i} variant="wide" onOpen={() => open(i, live)} />)}</Rail>}
              {movies.length > 0 && <Rail title={t("pages.search.movies")}>{movies.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
              {series.length > 0 && <Rail title={t("pages.search.series")}>{series.map((i) => <Card key={i.id} item={i} onOpen={() => open(i)} />)}</Rail>}
            </div>
          ) : <Empty>{tooShort ? t("pages.search.tooShort") : t("pages.search.none")}</Empty>}
        </div>
      </div>
    </Shell>
  )
}
