import { useEffect, useRef } from "react"
import { Pause, PictureInPicture2, Play, TriangleAlert, X } from "lucide-react"
import { Art, Pill } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { JUMP, type PSeg } from "./skip-pure"
import { epOf, NEXT_SECS } from "./util"

/** "Next episode" card (bottom end) with the countdown when auto-play is on. On TV Play now takes focus, so OK plays it and Back cancels (use-keys). */
export function NextCard({ item, secs, auto, tv, onPlay, onCancel }: { item: Item; secs: number; auto: boolean; tv: boolean; onPlay: () => void; onCancel: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (tv) requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-nav]")?.focus()) }, [tv])
  const ep = epOf(item.name)
  return (
    <div ref={ref} data-next role="group" aria-label={t("player.nextEpisode")} className="pl-card m-rise absolute bottom-[var(--pl-card-b)] end-[var(--gx)] z-10 w-[min(24rem,calc(100%-2rem))] overflow-hidden">
      <Art item={item} variant="wide" className="w-full bg-white/10">
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        <div className="absolute inset-x-4 bottom-3">
          <div className="pl-sub">{auto ? t("player.nextIn", { n: Math.max(0, secs) }) : t("player.nextEpisode")}</div>
          <div dir="auto" className="truncate text-lg font-medium">{ep ? `${t("player.epShort", { s: ep.s, e: ep.e })}  ·  ${item.epTitle || item.group}` : item.name}</div>
        </div>
        {auto && <div dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/20"><div className="pl-count h-full origin-left bg-white" style={{ transform: `scaleX(${Math.max(0, secs - 1) / NEXT_SECS})` }} /></div>}
      </Art>
      <div data-nav-group className="flex gap-2 p-3">
        <Pill variant="primary" className="pl-pill flex-1" onClick={onPlay}><Play className="fill-current" />{t("player.playNow")}</Pill>
        <Pill className="pl-pill flex-1" onClick={onCancel}>{t("player.cancel")}</Pill>
      </div>
    </div>
  )
}

/** "Skip intro / recap / credits" while the playhead is in it (or "Skip 85 s" early in an episode nobody has timings for). With the controls hidden on TV, OK skips (use-keys), except the jump. */
export function SkipChip({ seg, onSkip }: { seg: PSeg; onSkip: () => void }) {
  const t = useT()
  return (
    <div className="m-rise absolute bottom-[var(--pl-card-b)] end-[var(--gx)] z-10">
      <Pill variant="primary" className="pl-pill pl-skip" onClick={onSkip}>{t(`player.skip.${seg.kind}`, { n: JUMP })}</Pill>
    </div>
  )
}

/** Playback stopped for good: what failed and why in plain words, Retry first. [data-modal] keeps the D-pad on its buttons. */
export function ErrorView({ name, msg, canNext, onRetry, onNext, onBack }: { name: string; msg: string; canNext: boolean; onRetry: () => void; onNext: () => void; onBack: () => void }) {
  const t = useT()
  return (
    <div data-modal role="alertdialog" aria-label={msg} className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/85 p-6 text-center m-fade">
      <TriangleAlert className="size-14 text-white/70" />
      <div className="max-w-2xl">
        <div dir="auto" className="pl-sub mb-2">{name}</div>
        <div className="pl-title">{msg}</div>
      </div>
      <div data-nav-group className="flex flex-wrap justify-center gap-3">
        <Pill variant="primary" data-autofocus="" className="pl-pill" onClick={onRetry}>{t("player.retry")}</Pill>
        {canNext && <Pill className="pl-pill" onClick={onNext}>{t("player.next")}</Pill>}
        <Pill className="pl-pill" onClick={onBack}>{t("player.back")}</Pill>
      </div>
    </div>
  )
}

/** Mini player (corner, while another page is on top): the whole video expands it; play / pause, picture in picture and close at the top. */
export function Mini({ name, paused, buf, canPip, onExpand, onToggle, onPip, onClose }: { name: string; paused: boolean; buf: boolean; canPip: boolean; onExpand: () => void; onToggle: () => void; onPip: () => void; onClose: () => void }) {
  const t = useT()
  const btn = "grid size-9 place-items-center rounded-full bg-black/60"
  return (
    <div className="absolute inset-0">
      <button data-nav aria-label={t("player.mini.expand")} onClick={onExpand} className="absolute inset-0 size-full rounded-[inherit]" />
      <div dir="auto" className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-sm">{name}</div>
      <div className="absolute inset-x-0 top-2 mx-auto flex w-fit gap-1.5">
        <button data-nav aria-label={paused ? t("player.play") : t("player.pause")} onClick={onToggle} className={btn}>{paused ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}</button>
        {canPip && <button data-nav aria-label={t("player.pip")} onClick={onPip} className={btn}><PictureInPicture2 className="size-4" /></button>}
        <button data-nav aria-label={t("player.mini.close")} onClick={onClose} className={btn}><X className="size-5" /></button>
      </div>
      {buf && <div aria-hidden className="pointer-events-none absolute inset-0 m-auto size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
    </div>
  )
}
