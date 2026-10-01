import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useSourceFilter } from "@/layouts/hooks/use-source-filter"

/**
 * Source filter, styled like the main top bar tabs: plain text chips, the picked one is a filled surface pill, focus (TV) = white pill.
 * "All" + one chip per enabled source: its color dot, name and a short count (29.3K). Same-name sources are told apart by the type label.
 * Renders nothing with a single source. Props: className. Only the chips are interactive (data-nav); the hooks already apply the filter,
 * so just place it above the list.
 */
export function SourceFilter({ className }: { className?: string }) {
  const { sources, filter, setFilter, multi } = useSourceFilter()
  const t = useT()
  if (!multi) return null
  const total = sources.reduce((a, s) => a + s.count, 0)
  const tab = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-base font-medium whitespace-nowrap", on ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
  const count = (n: number) => <span dir="ltr" title={fmt.number(n)} className="text-sm font-normal tabular-nums opacity-70">{fmt.compact(n)}</span>
  return (
    <div role="radiogroup" aria-label={t("source.label")} data-nav-group className={cn("rail !mb-0 !items-center !gap-1 !pb-2 !pt-1", className)}>
      <button data-nav data-pill role="radio" aria-checked={!filter} onClick={() => setFilter(null)} className={tab(!filter)}>
        {t("source.all")} {count(total)}
      </button>
      {sources.map((s) => (
        <button key={s.id} data-nav data-pill role="radio" aria-checked={filter === s.id} onClick={() => setFilter(s.id)} className={tab(filter === s.id)}>
          <span aria-hidden style={{ background: s.color }} className="size-2.5 shrink-0 rounded-full" />
          <span dir="auto" className="max-w-[10rem] truncate">{s.title}</span>
          {count(s.count)}
        </button>
      ))}
    </div>
  )
}
