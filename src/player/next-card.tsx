import { useEffect, useRef } from "react"
import { Pill } from "@/components/gtv"
import { Logo } from "@/components/tv/ui"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { epOf, NEXT_SECS } from "./util"

/** "Next episode" card with the countdown (opacity/transform only). On TV the Play now button takes focus so Enter skips ahead. */
export function NextCard({ item, secs, auto, autoAll, showOff, tv, onSkip, onCancel, onToggleShow }: { item: Item; secs: number; auto: boolean; autoAll: boolean; showOff: boolean; tv: boolean; onSkip: () => void; onCancel: () => void; onToggleShow: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tv) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-nav]")?.focus())
  }, [tv])
  const ep = epOf(item.name)
  return (
    <div ref={ref} data-next role="group" aria-label={t("player.nextEpisode")} className="pl-next m-rise absolute end-[var(--gx)] bottom-28 z-10 w-[min(26rem,calc(100%-2rem))] overflow-hidden rounded-[var(--pl-r)] bg-surface text-foreground shadow-2xl sm:bottom-40">
      <div className="relative aspect-video w-full bg-surface-3">
        <Logo item={item} className="size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute inset-x-4 bottom-3 text-white">
          <div className="pl-sub">{t("player.nextEpisode")}</div>
          <div dir="auto" className="truncate font-medium" style={{ fontSize: "var(--pl-sub)" }}>{ep ? `${item.group} · ${t("player.epShort", { s: ep.s, e: ep.e })}` : item.name}</div>
        </div>
        {auto && (
          <div dir="ltr" data-ltr className="pl-progress absolute inset-x-0 bottom-0 rounded-none">
            <div className="pl-count" style={{ transform: `scaleX(${Math.max(0, secs - 1) / NEXT_SECS})` }} />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="pl-sub mb-3">{auto ? t("player.nextIn", { n: Math.max(0, secs) }) : showOff ? t("player.autoOffShow") : ""}</div>
        <div className="flex gap-2">
          <Pill variant="primary" className="pl-primary pl-act flex-1" onClick={onSkip}>{t("player.playNow")}</Pill>
          <Pill className="pl-btn pl-act flex-1" onClick={onCancel}>{t("player.cancel")}</Pill>
        </div>
        {autoAll && <Pill className="pl-btn pl-act mt-2 w-full" onClick={onToggleShow}>{showOff ? t("player.autoOnShow") : t("player.autoOffBtn")}</Pill>}
      </div>
    </div>
  )
}
