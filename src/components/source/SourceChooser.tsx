import { cn } from "@/lib/utils"
import type { SourceMeta } from "@/lib/sources"
import type { Item } from "@/lib/types"

/**
 * "Available on" pills for Detail. Props: alternatives ({item, source}[] from useDetail), selected (useDetail().selected),
 * onSelect (useDetail().selectSource), className. Renders nothing with fewer than 2 alternatives.
 */
export function SourceChooser({ alternatives, selected, onSelect, className }: { alternatives: { item: Item; source: SourceMeta }[]; selected?: Item; onSelect: (i: Item) => void; className?: string }) {
  if (alternatives.length < 2) return null
  return (
    <div role="group" aria-label="Available on" data-nav-group className={cn("-ml-1 flex flex-wrap items-center gap-2 p-1", className)}>
      <span className="mr-1 text-sm text-muted-foreground">Available on</span>
      {alternatives.map(({ item, source }) => {
        const on = item.id === selected?.id
        return (
          <button key={item.id} data-nav data-pill aria-pressed={on} onClick={() => onSelect(item)} style={on ? { boxShadow: `inset 0 0 0 2px ${source.color}` } : undefined}
            className={cn("flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-base", on ? "bg-accent-blue-container text-foreground" : "bg-surface-2 text-foreground/80")}>
            <span style={{ background: source.color }} className="size-2.5 shrink-0 rounded-full" />
            <span className="max-w-[12rem] truncate">{source.name}</span>
          </button>
        )
      })}
    </div>
  )
}
