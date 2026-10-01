import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { usePData } from "@/lib/store"
import type { Item } from "@/lib/types"

/** Google TV rail: calm 1.4rem title (not the shared 2xl one), optional "see all" chevron. Same .rail scroller as the shared one so focus is never clipped. */
export const GRail = ({ title, children, onSeeAll }: { title?: ReactNode; children: ReactNode; onSeeAll?: () => void }) => (
  <section className="-mx-[var(--gx)] mb-3">
    {title && (
      <div className="px-[var(--gx)]">
        {onSeeAll ? (
          <button data-nav data-pill onClick={onSeeAll} className="-ml-3 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[1.4rem] font-normal text-foreground">{title}<ChevronRight className="size-5 text-muted-foreground" /></button>
        ) : <h2 className="text-[1.4rem] font-normal text-foreground">{title}</h2>}
      </div>
    )}
    <div data-nav-group className="rail rail-in !mx-0">{children}</div>
  </section>
)

/** "N min left" for unfinished items (Continue watching caption). */
export function useLeft() {
  const d = usePData()
  return (i: Item) => { const p = d.progress[i.id]; return p && p.dur > p.pos ? `${Math.max(1, Math.ceil((p.dur - p.pos) / 60))} min left` : undefined }
}
