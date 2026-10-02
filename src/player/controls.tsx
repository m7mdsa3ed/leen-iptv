import type { RefObject } from "react"
import { Captions, ChevronsUp, Expand, Gauge, LayoutGrid, ListVideo, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Star, Timer, Volume1, Volume2, VolumeX } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import type { StreamQ } from "@/lib/quality"
import { useVideoTime } from "./use-time"
import { mmss, speedLabel } from "./util"
import { QualityBadge, qualityDetail, type Stats } from "./stats"
import type { MenuKind } from "./menus"

/** Time + seek bar. Owns the timeupdate subscription so the rest of the player never re-renders for it. */
function SeekRow({ vref, on, onSeekFrac, onToggle }: { vref: RefObject<HTMLVideoElement | null>; on: boolean; onSeekFrac: (f: number) => void; onToggle: () => void }) {
  const t = useT()
  const { cur, dur } = useVideoTime(vref, on)
  const p = dur ? Math.min(1, cur / dur) : 0
  const at = (e: React.PointerEvent<HTMLElement>) => { const b = e.currentTarget.getBoundingClientRect(); onSeekFrac(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width))) }
  return (
    <div dir="ltr" data-ltr className="pointer-events-auto mb-2 flex items-center gap-3 text-sm sm:gap-4 sm:text-lg">
      <span className="w-14 text-right sm:w-20">{mmss(cur)}</span>
      <button
        data-nav data-seek aria-label={t("player.seek")}
        className="pl-seek relative flex h-11 flex-1 touch-none items-center rounded-full"
        onClick={(e) => e.detail === 0 && onToggle()}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); at(e) }}
        onPointerMove={(e) => e.buttons && at(e)}
      >
        <span className="pl-track relative block w-full rounded-full">
          <span className="pl-fill absolute inset-0 origin-left rounded-full" style={{ transform: `scaleX(${p})` }} />
          <span className="pl-thumb absolute top-1/2 rounded-full" style={{ left: `${p * 100}%` }} />
        </span>
      </button>
      <span className="w-14 sm:w-20">{mmss(dur)}</span>
    </div>
  )
}

export type ControlsProps = {
  on: boolean; live: boolean; tv: boolean; touch: boolean; vref: RefObject<HTMLVideoElement | null>
  paused: boolean; queueLen: number; mediaServer: boolean; sq: StreamQ; fitName: string; speed: number
  canPip: boolean; pip: boolean; fs: boolean; isFav: boolean; stats: Stats | null; vol: number; muted: boolean
  onPrev: () => void; onNext: () => void; onToggle: () => void; onSeek: (d: number) => void; onSeekFrac: (f: number) => void
  onMute: () => void; onVolume: (x: number) => void; onFav: () => void; onMenu: (m: MenuKind) => void
  onPip: () => void; onFs: () => void; onMore: () => void; onGuide: () => void; onChannels: () => void
}

/** Bottom block: seek bar + times (VOD), then three zones: transport | tools | quality badge, then the "More" chevron. */
export function Controls(c: ControlsProps) {
  const t = useT()
  const tool = "pl-btn h-12 px-3 lg:px-5"
  const lbl = "hidden lg:inline"
  const ic = "lg:me-1"
  return (
    <div data-on={c.on ? "" : undefined} data-controls className="pl-layer pl-bottom pointer-events-none px-[var(--gx)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 sm:pt-24">
      {!c.live && <SeekRow vref={c.vref} on={c.on} onSeekFrac={c.onSeekFrac} onToggle={c.onToggle} />}
      {c.stats && <div className="mb-1 text-end text-xs text-white/60 sm:text-sm">{qualityDetail(c.stats)}</div>}
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:justify-between">
        <div dir="ltr" data-ltr className="flex items-center justify-center gap-2 sm:gap-3">
          {c.queueLen > 1 && <RoundButton label={t("player.previous")} className="pl-btn" onClick={c.onPrev}><SkipBack /></RoundButton>}
          {!c.live && <RoundButton label={t("player.back10")} className="pl-btn" onClick={() => c.onSeek(-10)}><RotateCcw /></RoundButton>}
          <RoundButton data-play data-primary label={c.paused ? t("player.play") : t("player.pause")} className="pl-primary size-14 [&_svg]:size-7" onClick={c.onToggle}>{c.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</RoundButton>
          {!c.live && <RoundButton label={t("player.forward10")} className="pl-btn" onClick={() => c.onSeek(10)}><RotateCw /></RoundButton>}
          {c.queueLen > 1 && <RoundButton label={t("player.next")} className="pl-btn" onClick={c.onNext}><SkipForward /></RoundButton>}
          {!c.tv && (
            <div className="ms-1 flex items-center gap-2 sm:ms-3">
              <RoundButton label={t("player.mute")} className="pl-btn" onClick={c.onMute}>{c.muted || !c.vol ? <VolumeX /> : <Volume2 />}</RoundButton>
              <input type="range" aria-label={t("player.volume")} min={0} max={1} step={0.05} value={c.muted ? 0 : c.vol} onChange={(e) => c.onVolume(+e.target.value)} className="hidden w-24 accent-primary lg:block" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {!c.touch && <RoundButton label={t("player.favorite")} active={c.isFav} className="pl-btn" onClick={c.onFav}><Star className={c.isFav ? "fill-yellow-400 text-yellow-400" : ""} /></RoundButton>}
          {c.live && <Pill aria-label={t("player.guide")} className={tool} onClick={c.onGuide}><LayoutGrid className={ic} /><span className={lbl}>{t("player.guide")}</span></Pill>}
          {c.live && <Pill aria-label={t("player.channels")} className={tool} onClick={c.onChannels}><ListVideo className={ic} /><span className={lbl}>{t("player.channels")}</span></Pill>}
          <Pill aria-label={t("player.audio")} className={tool} onClick={() => c.onMenu("audio")}><Volume1 className={ic} /><span className={lbl}>{t("player.audio")}</span></Pill>
          <Pill aria-label={t("player.subtitles")} className={tool} onClick={() => c.onMenu("subs")}><Captions className={ic} /><span className={lbl}>{t("player.subtitles")}</span></Pill>
          {c.mediaServer && !c.live && <Pill aria-label={t("player.quality")} className={tool} onClick={() => c.onMenu("quality")}><Gauge className={ic} /><span className={lbl}>{c.sq.id === "original" ? t("player.original") : `${c.sq.height}p`}</span></Pill>}
          {!c.live && <Pill aria-label={t("player.speed")} className={tool} onClick={() => c.onMenu("speed")}><Timer className={ic} /><span className={lbl} dir="ltr">{speedLabel(c.speed)}</span></Pill>}
          <Pill aria-label={t("player.aspect")} className={tool} onClick={() => c.onMenu("aspect")}><Maximize className={ic} /><span className={lbl}>{c.fitName}</span></Pill>
          {c.canPip && <RoundButton label={t("player.pip")} active={c.pip} className="pl-btn" onClick={c.onPip}><PictureInPicture2 className={c.pip ? "text-primary" : ""} /></RoundButton>}
          {!c.tv && <RoundButton label={t("player.fullscreen")} className="pl-btn" onClick={c.onFs}>{c.fs ? <Minimize /> : <Expand />}</RoundButton>}
        </div>
        {c.stats && <QualityBadge s={c.stats} />}
      </div>
      <div className="pointer-events-auto mt-1 flex justify-center">
        <Pill data-more variant="ghost" aria-label={t("player.moreOpen")} className="pl-more-btn text-white/80" onClick={c.onMore}><ChevronsUp className="pl-more-ic" />{t("player.more")}</Pill>
      </div>
      {c.tv && <div className="pointer-events-none mt-1 text-center text-sm text-white/60">{t("player.remoteHint")}</div>}
    </div>
  )
}
