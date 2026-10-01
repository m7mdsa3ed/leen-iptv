import { cn } from "@/lib/utils"
import { useSourceFilter } from "@/layouts/hooks/use-source-filter"

/**
 * Pill bar: "All" + one pill per enabled source (color dot + name + count). Props: className.
 * Selected pill = accent container + underline in the source color. Renders nothing with a single source.
 * Only the pills are interactive (data-nav); the hooks already apply the filter, so just place it above the list.
 */
export function SourceFilter({ className }: { className?: string }) {
  const { sources, filter, setFilter, multi } = useSourceFilter()
  if (!multi) return null
  const total = sources.reduce((a, s) => a + s.count, 0)
  const pill = (on: boolean) => cn("flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 py-2 text-base", on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")
  return (
    <div role="group" aria-label="Source" data-nav-group className={cn("rail !mb-0 !gap-3 !pb-2", className)}>
      <button data-nav data-pill aria-pressed={!filter} onClick={() => setFilter(null)} className={pill(!filter)} style={!filter ? { boxShadow: "inset 0 -3px 0 #94a3b8" } : undefined}>
        All <span className="text-sm text-muted-foreground">{total}</span>
      </button>
      {sources.map((s) => (
        <button key={s.id} data-nav data-pill aria-pressed={filter === s.id} onClick={() => setFilter(s.id)} className={pill(filter === s.id)} style={filter === s.id ? { boxShadow: `inset 0 -3px 0 ${s.color}` } : undefined}>
          <span style={{ background: s.color }} className="size-2.5 shrink-0 rounded-full" />
          <span className="max-w-[10rem] truncate">{s.name}</span>
          <span className="text-sm text-muted-foreground">{s.count}</span>
        </button>
      ))}
    </div>
  )
}
