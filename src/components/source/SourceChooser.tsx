import { ChevronDown } from "lucide-react"
import { ActionsMenu } from "@/components/tv/actions-menu"
import { fmt, useT } from "@/lib/i18n"
import { versionTags } from "@/lib/merge-pure"
import { cn } from "@/lib/utils"
import { SourceMark } from "./SourceMark"
import type { SourceMeta } from "@/lib/sources"
import type { Item } from "@/lib/types"

/**
 * Version picker for Detail: one pill with the copy that plays (source mark, source name, its tags such as 4K / HEVC / AR, how many versions),
 * opening a pick list with one row per copy (source, tags, the source's full name; a check on the selected one).
 * Props: alternatives ({item, source}[] from useDetail), selected (useDetail().selected), onSelect (useDetail().selectSource), className.
 * Renders nothing with fewer than 2 alternatives.
 */
export function SourceChooser({ alternatives, selected, onSelect, className }: { alternatives: { item: Item; source: SourceMeta }[]; selected?: Item; onSelect: (i: Item) => void; className?: string }) {
  const t = useT()
  if (alternatives.length < 2) return null
  const label = (a: { item: Item; source: SourceMeta }) => [a.source.name, ...versionTags(a.item)].join(" · ")
  const cur = alternatives.find((a) => a.item.id === selected?.id) ?? alternatives[0]
  return (
    <ActionsMenu
      items={alternatives.map((a) => ({
        label: label(a), detail: a.item.srcName ?? a.item.name, checked: a.item.id === cur.item.id, run: () => onSelect(a.item),
        icon: <SourceMark type={a.source.type} color={a.source.color} className="size-5" />,
      }))}
      trigger={(o) => (
        <button data-nav data-pill aria-haspopup="menu" aria-expanded={o.open} aria-label={`${t("source.chooseVariant")}: ${label(cur)}`} onClick={o.toggle}
          className={cn("inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-base", className)}>
          <SourceMark type={cur.source.type} color={cur.source.color} />
          <span dir="auto" className="min-w-0 truncate">{label(cur)}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{fmt.plural("source.versions", alternatives.length)}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}
    />
  )
}
