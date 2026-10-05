import { fmt, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { onColor, SOURCE_LABELS, useBadges, useSourceOf } from "@/lib/sources"
import { hasMark, SourceMark } from "./SourceMark"
import type { Item } from "@/lib/types"

/**
 * Colored source chip. Props: item (its source comes from item.id), dot (small colored dot for tight tiles, no text),
 * className (position it yourself, e.g. "absolute start-2 bottom-2"). Shows "+N" when item.alts has entries.
 * Renders nothing when fewer than two sources are connected (a failed or hidden one does not count) or Settings > Sources "badges" is off.
 */
export function SourceBadge({ item, dot, className }: { item: Item; dot?: boolean; className?: string }) {
  const src = useSourceOf(item)
  const on = useBadges()
  useT() // re-render on language switch (digits)
  if (!on || !src) return null
  const n = item.alts?.length || 0
  const logo = hasMark(src.type) && src.label === SOURCE_LABELS[src.type] // a custom label stays as text
  if (dot) return <span role="img" aria-label={src.label} title={src.label} className={cn("inline-flex shrink-0", className)}><SourceMark type={src.type} color={src.color} /></span>
  return (
    <span style={{ background: src.color, color: onColor(src.color) }} className={cn("pointer-events-none inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-xs font-semibold leading-4", className)}>
      {logo ? <><SourceMark type={src.type} className="size-3.5" /><span className="sr-only">{src.label}</span></> : src.label}{n > 0 && <span dir="ltr" className="opacity-90">+{fmt.number(n)}</span>}
    </span>
  )
}
