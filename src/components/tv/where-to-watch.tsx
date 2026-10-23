import { useT } from "@/lib/i18n"
import type { Avail } from "@/lib/meta/types"

/** Where a title streams (Watchmode): one link chip per service. Renders nothing while empty. */
export function WhereToWatch({ avail, className }: { avail: Avail[]; className?: string }) {
  const t = useT()
  if (!avail.length) return null
  const word = (a: Avail) => (a.kind === "purchase" ? a.price || t("pages.detail.avail.purchase") : t(`pages.detail.avail.${a.kind}`))
  return (
    <div className={className}>
      <h3 className="text-sm text-muted-foreground">{t("pages.detail.whereToWatch")}</h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {avail.map((a) => (
          <a key={`${a.source}|${a.kind}`} data-nav data-pill href={a.web} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm text-foreground/80">
            <bdi>{a.source}</bdi><span className="text-muted-foreground"><bdi>{word(a)}</bdi></span>
          </a>
        ))}
      </div>
    </div>
  )
}
