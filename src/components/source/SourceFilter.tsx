import { Check } from "lucide-react"
import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { SourceMark } from "./SourceMark"
import { useSourceFilter } from "@/layouts/hooks/use-source-filter"

/**
 * Source filter, styled like the main top bar tabs: plain text chips, picked ones filled with a tick, focus (TV) = white pill.
 * Multi-select: pick any number of sources, "All" clears. Renders nothing with a single source. Props: className.
 * Only the chips are interactive (data-nav); the hooks already apply the filter, so just place it above the list.
 */
export function SourceFilter({ className }: { className?: string }) {
  const { sources, filter, toggle, clear, multi } = useSourceFilter()
  const t = useT()
  if (!multi) return null
  const total = sources.reduce((a, s) => a + s.count, 0)
  const tab = (on: boolean) => cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-base font-medium whitespace-nowrap", on ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground")
  const count = (n: number) => <span dir="ltr" title={fmt.number(n)} className="text-sm font-normal tabular-nums opacity-70">{fmt.compact(n)}</span>
  return (
    <div role="group" aria-label={t("source.label")} data-nav-group className={cn("rail !mb-0 !items-center !gap-1 !pb-2 !pt-1", className)}>
      <button data-nav data-pill aria-pressed={!filter.length} onClick={clear} className={tab(!filter.length)}>
        {t("source.all")} {count(total)}
      </button>
      {sources.map((s) => {
        const on = filter.includes(s.id)
        return (
          <button key={s.id} data-nav data-pill aria-pressed={on} onClick={() => toggle(s.id)} className={tab(on)}>
            <SourceMark type={s.type} color={s.color} />
            <span dir="auto" className="max-w-[10rem] truncate">{s.title}</span>
            {count(s.count)}
            {on && <Check className="size-4 shrink-0" />}
          </button>
        )
      })}
    </div>
  )
}
