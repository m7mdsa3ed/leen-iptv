import { useEffect, useRef } from "react"
import { Pill } from "@/components/gtv"
import { Logo } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { epOf, NEXT_SECS } from "./util"

/** "Next episode" card with the countdown (opacity/transform only). On TV the Play now button takes focus so Enter skips ahead. */
export function NextCard({ item, secs, auto, tv, onSkip, onCancel }: { item: Item; secs: number; auto: boolean; tv: boolean; onSkip: () => void; onCancel: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tv) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-nav]")?.focus())
  }, [tv])
  const ep = epOf(item.name)
  return (
    <div ref={ref} data-next role="group" aria-label={t("player.nextEpisode")} className="pl-next m-rise absolute end-[var(--gx)] bottom-28 z-10 w-[min(22rem,calc(100%-2rem))] overflow-hidden rounded-3xl bg-surface p-4 text-foreground shadow-2xl sm:bottom-40">
      <div className="flex items-center gap-3">
        <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-xl bg-surface-3"><Logo item={item} className="size-full object-cover" /></div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{t("player.nextEpisode")}</div>
          <div dir="auto" className="truncate text-base font-medium">{ep ? t("player.epShort", { s: ep.s, e: ep.e }) : item.name}</div>
          {auto && <div className="text-sm text-muted-foreground">{t("player.nextIn", { n: Math.max(0, secs) })}</div>}
        </div>
      </div>
      {auto && (
        <div dir="ltr" data-ltr className="mt-3 h-1 overflow-hidden rounded-full bg-white/20">
          <div className="pl-count h-full origin-left rounded-full bg-accent-blue" style={{ transform: `scaleX(${Math.max(0, secs - 1) / NEXT_SECS})` }} />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Pill variant="primary" className="pl-primary flex-1" onClick={onSkip}>{t("player.playNow")}</Pill>
        <Pill className="flex-1" onClick={onCancel}>{t("player.cancel")}</Pill>
      </div>
    </div>
  )
}
