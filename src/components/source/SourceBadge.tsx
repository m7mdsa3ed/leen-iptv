import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { onColor, useBadges, useSourceOf } from "@/lib/sources"
import type { Item } from "@/lib/types"

/**
 * Colored source chip. Props: item (its source comes from item.id), dot (small colored dot for tight tiles, no text),
 * className (position it yourself, e.g. "absolute start-2 bottom-2"). Shows "+N" when item.alts has entries.
 * Renders nothing when only one source is enabled or Settings > Sources "badges" is off.
 */
export function SourceBadge({ item, dot, className }: { item: Item; dot?: boolean; className?: string }) {
  const src = useSourceOf(item)
  const on = useBadges()
  useT() // re-render on language switch (digits)
  if (!on || !src) return null
  const n = item.alts?.length || 0
  if (dot) return <span aria-label={src.label} title={src.label} style={{ background: src.color }} className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} />
  return (
    <span style={{ background: src.color, color: onColor(src.color) }} className={cn("pointer-events-none inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-semibold leading-4", className)}>
      {src.label}{n > 0 && <span dir="ltr" className="opacity-90">+{fmt.number(n)}</span>}
    </span>
  )
}
