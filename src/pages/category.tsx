import { ArrowLeft } from "lucide-react"
import { Card, Pill, RoundButton } from "@/components/gtv"
import { SourceFilter } from "@/components/source/SourceFilter"
import { Empty, Pending, Shell, VGrid } from "@/components/tv/ui"
import { Input } from "@/components/ui/input"
import { useCategory } from "@/layouts/hooks/use-category"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"

/** Every title of one category, as its own page. Route id = `${kind}|${category}`. */
export default function CategoryPage({ id }: { id: string }) {
  const { kind, group, status, ok, all, items, sort, setSort, sorts, q, setQ, back, pct, open } = useCategory(id)
  const t = useT()
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={group}>
      {status !== "ready" ? <Pending /> : !ok ? null : (
        (() => {
          const head = (<>
          <div className="m-rise flex flex-wrap items-center gap-3 pb-2">
            {!isTv && <RoundButton label={t("common.back")} onClick={back}><ArrowLeft className="rtl-flip" /></RoundButton>}
            <div className="me-auto min-w-0">
              <h2 dir="auto" className="truncate text-3xl font-medium tracking-tight">{group}</h2>
              <div className="text-sm text-muted-foreground">{items.length === all.length ? fmt.plural("pages.category.titles", all.length) : t("pages.category.titlesOf", { n: items.length, total: all.length })}</div>
            </div>
            {sorts.map(([s, label]) => (
              <Pill key={s} variant={sort === s ? "primary" : "tonal"} onClick={() => setSort(s)}>{label}</Pill>
            ))}
            <Input data-nav dir="auto" className="h-11 w-48 rounded-full text-base focus-visible:ring-0 md:w-64 [html[data-mode=mobile]_&]:text-[16px]" type="search" autoComplete="off" placeholder={t("pages.category.filter")} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <SourceFilter />
          </>)
          if (items.length) return <VGrid items={items} render={(i) => <Card key={i.id} item={i} fluid pct={pct(i)} onOpen={() => open(i)} />} head={head} className="-mt-[var(--hdr)] pt-[var(--hdr)] [--up:var(--hdr)]" />
          return (
            <div className="flex h-full flex-col">
              {head}
              <div className="m-fade min-h-0 flex-1" style={{ "--i": 1 } as React.CSSProperties}>
            <Empty>{t("pages.category.none")}</Empty>
              </div>
            </div>
          )
        })()
      )}
    </Shell>
  )
}
