import { ArrowLeft } from "lucide-react"
import { Empty, Pending, Shell } from "@/components/tv/ui"
import { useCategory } from "@/layouts/hooks/use-category"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { PagedGrid, Pick, Dropdown, DropLabel, SourceBar, Tile, usePlay, variantOf } from "../ui"

/** Category page, Netflix style: title strip (Sort dropdown, filter) over a plain tile grid. Route id = `${kind}|${category}`. */
export default function CategoryPage({ id }: { id: string }) {
  const { kind, group, status, ok, all, items, sort, setSort, sorts, q, setQ, back, pct, open } = useCategory(id)
  const t = useT()
  const play = usePlay()
  const v = variantOf(items)
  return (
    <Shell page={kind === "movie" ? "movies" : "series"} title={group}>
      {status !== "ready" ? <Pending /> : !ok ? null : (
        <div className="nf-page">
          <div className="nf-strip">
            {!isTv && <button data-nav aria-label={t("nf.category.back")} onClick={back} className="nf-hbtn"><ArrowLeft className="rtl-flip size-6" /></button>}
            <h1 dir="auto" className="nf-h1">{group}</h1>
            <span className="text-sm text-muted-foreground">{items.length === all.length ? fmt.plural("nf.category.titles", all.length) : t("nf.category.of", { n: items.length, total: all.length })}</span>
            <Dropdown className="nf-drop" trigger={<DropLabel>{sorts.find(([s]) => s === sort)?.[1] ?? t("nf.category.sort")}</DropLabel>}>
              {(close) => sorts.map(([s, label]) => <Pick key={s} active={s === sort} onClick={() => { close(); setSort(s) }}>{label}</Pick>)}
            </Dropdown>
            <label className="nf-search !min-h-0 py-1"><input data-nav dir="auto" type="search" autoComplete="off" placeholder={t("nf.category.filter")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          </div>
          <SourceBar />
          {items.length ? <PagedGrid variant={v} items={items} render={(i) => <Tile key={i.id} item={i} variant={v} fluid pct={pct(i)} onOpen={() => open(i)} onPlay={() => play(i)} />} /> : <div className="h-64"><Empty>{t("nf.category.nothing")}</Empty></div>}
        </div>
      )}
    </Shell>
  )
}
