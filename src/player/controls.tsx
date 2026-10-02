import type { ReactNode, RefObject } from "react"
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

/** One tool button for every non-transport control: same height and radius everywhere, icon only on phones, icon + label from lg and on TV (CSS decides, see .pl-tool). */
function Tool({ label, text, active, onClick, children }: { label: string; text?: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Pill aria-label={label} className={`pl-btn pl-tool${text ? " pl-tool-t" : ""}${active ? " pl-tool-on" : ""}`} onClick={onClick}>
      {children}
      {text && <span className="pl-tool-lbl" dir="auto">{text}</span>}
    </Pill>
  )
}

/** Bottom block: seek bar + times (VOD), then transport (left) and tools (right), then the "More" handle. Sizes come from --pl-h (player.css), so phone, desktop and TV share one layout. */
export function Controls(c: ControlsProps) {
  const t = useT()
  return (
    <div data-on={c.on ? "" : undefined} data-controls className="pl-layer pl-bottom pointer-events-none px-[var(--gx)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {!c.live && <SeekRow vref={c.vref} on={c.on} onSeekFrac={c.onSeekFrac} onToggle={c.onToggle} />}
      {c.stats && <div className="mb-1 hidden text-end text-sm text-white/60 sm:block">{qualityDetail(c.stats)}</div>}
      <div className="pl-bar-row pointer-events-auto">
        <div dir="ltr" data-ltr className="pl-transport">
          {c.queueLen > 1 && <RoundButton label={t("player.previous")} className="pl-btn pl-rb" onClick={c.onPrev}><SkipBack /></RoundButton>}
          {!c.live && <RoundButton label={t("player.back10")} className="pl-btn pl-rb" onClick={() => c.onSeek(-10)}><RotateCcw /></RoundButton>}
          <RoundButton data-play data-primary label={c.paused ? t("player.play") : t("player.pause")} className="pl-primary pl-rb pl-rb-main [&_svg]:size-7" onClick={c.onToggle}>{c.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</RoundButton>
          {!c.live && <RoundButton label={t("player.forward10")} className="pl-btn pl-rb" onClick={() => c.onSeek(10)}><RotateCw /></RoundButton>}
          {c.queueLen > 1 && <RoundButton label={t("player.next")} className="pl-btn pl-rb" onClick={c.onNext}><SkipForward /></RoundButton>}
          {!c.tv && (
            <div className="ms-1 flex items-center gap-2 sm:ms-3">
              <Tool label={t("player.mute")} onClick={c.onMute}>{c.muted || !c.vol ? <VolumeX /> : <Volume2 />}</Tool>
              <input type="range" aria-label={t("player.volume")} min={0} max={1} step={0.05} value={c.muted ? 0 : c.vol} onChange={(e) => c.onVolume(+e.target.value)} className="hidden w-24 accent-primary lg:block" />
            </div>
          )}
        </div>
        <div className="pl-tools">
          {!c.touch && <Tool label={t("player.favorite")} active={c.isFav} onClick={c.onFav}><Star className={c.isFav ? "fill-yellow-400 text-yellow-400" : ""} /></Tool>}
          {c.live && <Tool label={t("player.guide")} text={t("player.guide")} onClick={c.onGuide}><LayoutGrid /></Tool>}
          {c.live && <Tool label={t("player.channels")} text={t("player.channels")} onClick={c.onChannels}><ListVideo /></Tool>}
          <Tool label={t("player.audio")} text={t("player.audio")} onClick={() => c.onMenu("audio")}><Volume1 /></Tool>
          <Tool label={t("player.subtitles")} text={t("player.subtitles")} onClick={() => c.onMenu("subs")}><Captions /></Tool>
          {c.mediaServer && !c.live && <Tool label={t("player.quality")} text={c.sq.id === "original" ? t("player.original") : `${c.sq.height}p`} onClick={() => c.onMenu("quality")}><Gauge /></Tool>}
          {!c.live && <Tool label={t("player.speed")} text={speedLabel(c.speed)} onClick={() => c.onMenu("speed")}><Timer /></Tool>}
          <Tool label={t("player.aspect")} text={c.fitName} onClick={() => c.onMenu("aspect")}><Maximize /></Tool>
          {c.canPip && <Tool label={t("player.pip")} active={c.pip} onClick={c.onPip}><PictureInPicture2 /></Tool>}
          {!c.tv && <Tool label={t("player.fullscreen")} onClick={c.onFs}>{c.fs ? <Minimize /> : <Expand />}</Tool>}
          {c.stats && <QualityBadge s={c.stats} />}
        </div>
      </div>
      <div className="pointer-events-auto mt-1 flex justify-center">
        <Pill data-more variant="ghost" aria-label={t("player.moreOpen")} className="pl-more-btn text-white/80" onClick={c.onMore}><ChevronsUp className="pl-more-ic" />{t("player.more")}</Pill>
      </div>
      {c.tv && <div className="pointer-events-none mt-1 text-center text-sm text-white/60">{t("player.remoteHint")}</div>}
    </div>
  )
}
