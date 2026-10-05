import { useEffect, useState, type ReactNode, type RefObject } from "react"
import { Expand, Info, ListVideo, MessageSquareText, Minimize, MoonStar, Pause, Play, RotateCcw, RotateCw, Settings2, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { useT } from "@/lib/i18n"
import { useVideoTime } from "./use-time"
import { mmss } from "./util"
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
  paused: boolean; queueLen: number
  sleepAt: number | null // active sleep timer: the wall-clock time it fires, else null
  fs: boolean; vol: number; muted: boolean
  onPrev: () => void; onNext: () => void; onToggle: () => void; onSeek: (d: number) => void; onSeekFrac: (f: number) => void
  onMute: () => void; onVolume: (x: number) => void; onMenu: (m: MenuKind) => void
  onFs: () => void; onMore: () => void; onChannels: () => void
}

/** Minutes left on an active sleep timer ("30 min", "1 min"). Ticks on its own so Player never re-renders every second. */
function SleepLeft({ at }: { at: number }) {
  const t = useT()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{t("player.sleep.min", { n: Math.max(1, Math.ceil((at - Date.now()) / 60000)) })}</>
}

/** One tool button for every non-transport control: same height and radius everywhere, icon only on phones, icon + label from lg and on TV (CSS decides, see .pl-tool). */
function Tool({ label, text, active, more, onClick, children }: { label: string; text?: ReactNode; active?: boolean; more?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Pill aria-label={label} data-more={more ? "" : undefined} className={`pl-btn pl-tool${text ? " pl-tool-t" : ""}${active ? " pl-tool-on" : ""}`} onClick={onClick}>
      {children}
      {text && <span className="pl-tool-lbl" dir="auto">{text}</span>}
    </Pill>
  )
}

/** Bottom block: seek bar + times (VOD), then transport (left) and a short tools row (right): Audio & subtitles, Settings (quality, speed, aspect, sleep, favorite, picture in picture, playback info), More (series info, episodes, cast); the sleep chip only while a timer runs. Sizes come from --pl-h (player.css), so phone, desktop and TV share one layout. */
export function Controls(c: ControlsProps) {
  const t = useT()
  return (
    <div data-on={c.on ? "" : undefined} data-controls className="pl-layer pl-bottom pointer-events-none px-[var(--gx)] pb-[max(0.75rem,var(--safe-b))]">
      {!c.live && <SeekRow vref={c.vref} on={c.on} onSeekFrac={c.onSeekFrac} onToggle={c.onToggle} />}
      <div className="pl-bar-row pointer-events-auto">
        <div dir="ltr" data-ltr className="pl-transport">
          {c.queueLen > 1 && <RoundButton label={t("player.previous")} className="pl-btn pl-rb" onClick={c.onPrev}><SkipBack /></RoundButton>}
          {!c.live && <RoundButton label={t("player.back10")} className="pl-btn pl-rb" onClick={() => c.onSeek(-10)}><RotateCcw /></RoundButton>}
          <RoundButton data-play data-autofocus="" label={c.paused ? t("player.play") : t("player.pause")} className="pl-btn pl-rb pl-rb-main [&_svg]:size-7" onClick={c.onToggle}>{c.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</RoundButton>
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
          {c.live && <Tool label={t("player.channels")} text={t("player.channels")} onClick={c.onChannels}><ListVideo /></Tool>}
          <Tool label={t("player.av")} text={t("player.av")} onClick={() => c.onMenu("av")}><MessageSquareText /></Tool>
          <Tool label={t("player.settings")} text={t("player.settings")} onClick={() => c.onMenu("settings")}><Settings2 /></Tool>
          {c.sleepAt && <Tool label={t("player.sleep.title")} text={<SleepLeft at={c.sleepAt} />} active onClick={() => c.onMenu("sleep")}><MoonStar /></Tool>}
          {!c.tv && <Tool label={t("player.fullscreen")} onClick={c.onFs}>{c.fs ? <Minimize /> : <Expand />}</Tool>}
          <Tool more label={t("player.moreOpen")} text={t("player.more")} onClick={c.onMore}><Info /></Tool>
        </div>
      </div>
      {c.tv && <div className="pointer-events-none mt-1 text-center text-sm text-white/60">{t("player.remoteHint")}</div>}
    </div>
  )
}
