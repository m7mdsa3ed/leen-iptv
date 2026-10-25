import { useEffect, useRef } from "react"
import { Play, TriangleAlert } from "lucide-react"
import { Art } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { Chip } from "./ui"
import { epOf, NEXT_SECS } from "./util"

/* The Next card is placed by the player's .pl-float stack (bottom end, above the dock); it does not position itself. */

/** "Next episode" card with the countdown when auto-play is on. On TV Play now takes focus, so OK plays it and Back cancels (use-keys). */
export function NextCard({ item, secs, auto, tv, onPlay, onCancel }: { item: Item; secs: number; auto: boolean; tv: boolean; onPlay: () => void; onCancel: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (tv) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-nav]")?.focus()) }, [tv])
  const ep = epOf(item.name)
  return (
    <div ref={ref} data-next role="group" aria-label={t("player.nextEpisode")} className="pl-card m-rise w-[24rem] max-w-full">
      <Art item={item} variant="wide" className="w-full bg-white/10">
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-4 bottom-3">
          <div className="pl-meta">{auto ? t("player.nextIn", { n: Math.max(0, secs) }) : t("player.nextEpisode")}</div>
          <div dir="auto" className="pl-trunc mt-0.5 text-[length:var(--pl-fs-l)] font-medium">{ep ? `${t("player.epShort", { s: ep.s, e: ep.e })}  ·  ${item.epTitle || item.group}` : item.name}</div>
        </div>
        {auto && <span dir="ltr" className="pl-track absolute inset-x-0 bottom-0 !h-1 !rounded-none"><span className="pl-fill pl-count !rounded-none" style={{ transform: `scaleX(${Math.max(0, secs - 1) / NEXT_SECS})` }} /></span>}
      </Art>
      <div data-nav-group className="flex gap-2 p-3">
        <Chip on className="flex-1" icon={<Play className="fill-current" />} onClick={onPlay}>{t("player.playNow")}</Chip>
        <Chip className="flex-1" onClick={onCancel}>{t("player.cancel")}</Chip>
      </div>
    </div>
  )
}

/** Playback stopped for good: what failed and why in plain words, Retry first. [data-modal] keeps the D-pad on its buttons. */
export function ErrorView({ name, msg, canNext, onRetry, onNext, onBack }: { name: string; msg: string; canNext: boolean; onRetry: () => void; onNext: () => void; onBack: () => void }) {
  const t = useT()
  return (
    <div data-modal role="alertdialog" aria-label={msg} className="m-fade absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-[var(--pl-fill)]"><TriangleAlert className="size-8 text-white/80" /></span>
      <div className="flex max-w-2xl flex-col gap-2">
        <div dir="auto" className="pl-sub">{name}</div>
        <div className="pl-title">{msg}</div>
      </div>
      <div data-nav-group className="pl-wrap justify-center">
        <Chip on data-autofocus="" onClick={onRetry}>{t("player.retry")}</Chip>
        {canNext && <Chip onClick={onNext}>{t("player.next")}</Chip>}
        <Chip onClick={onBack}>{t("player.back")}</Chip>
      </div>
    </div>
  )
}
