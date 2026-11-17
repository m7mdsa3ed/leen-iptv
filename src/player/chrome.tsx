import { useEffect, useRef, useState, type RefObject } from "react"
import { ArrowLeft, AudioLines, Cast, ChevronDown, ChevronsRight, ChevronUp, Expand, Gauge, Info, ListVideo, Minimize, MoonStar, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, RotateCwSquare, SkipBack, SkipForward, SlidersHorizontal, Star, Volume2, VolumeX } from "lucide-react"
import { castSupported } from "@/lib/cast"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { LiveHead } from "./live"
import { PausedInfo } from "./paused"
import { SPEEDS } from "./prefs"
import { Scrubber } from "./scrubber"
import { Chip, IconBtn } from "./ui"
import type { P } from "./use-player"
import { useVideoTime } from "./use-time"
import { describe, speedLabel } from "./util"

/** What is playing, VOD: the title (series for an episode) over its line (S1 E3 · episode title / year · category).
 *  `top` = the compact copy in the top bar (desktop / tablet), beside Back. */
function Head({ p, top }: { p: P; top?: boolean }) {
  const t = useT()
  if (p.live) return <LiveHead item={p.item} />
  const { title, sub } = describe(p.item, t)
  return (
    <div className={top ? "pl-head pl-head-top" : "pl-head"}>
      <div dir="auto" className="pl-title pl-trunc">{title}</div>
      {sub && <div dir="auto" className="pl-sub pl-trunc">{sub}</div>}
    </div>
  )
}

/** The time over clean video, top end (a device preference: Playback tab, Settings > Playback). Ticks on its own, never focusable. */
export function VideoClock() {
  const [now, setNow] = useState(new Date())
  useT() // re-render on language switch (the time format follows it)
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(i) }, [])
  return (
    <div aria-hidden className="pl-clock">
      <span dir="ltr" data-ltr>{fmt.time(now)}</span>
    </div>
  )
}

/** "Ends at 22:41": the time left at the current speed, added to now (VOD). Ticks with the video time, so it is its own component. */
function EndsAt({ vref, speed, on }: { vref: RefObject<HTMLVideoElement | null>; speed: number; on: boolean }) {
  const t = useT()
  const { cur, dur } = useVideoTime(vref, on)
  if (!dur || dur - cur < 30) return null
  return <span className="pl-ends">{t("player.endsAt", { time: fmt.time(new Date(Date.now() + ((dur - cur) / (speed || 1)) * 1000)) })}</span>
}

/** "Skip intro" (+85 s) while an episode is in its opening minutes. The sources carry no intro markers, so it is a fixed window (0:20 - 4:00)
 *  on episodes longer than 15 minutes; it goes away by itself once that window passes. */
function SkipIntro({ vref, on, onSkip }: { vref: RefObject<HTMLVideoElement | null>; on: boolean; onSkip: () => void }) {
  const t = useT()
  const { cur, dur } = useVideoTime(vref, on)
  if (!dur || dur < 15 * 60 || cur < 20 || cur > 240) return null
  return <Chip icon={<ChevronsRight className="rtl-flip" />} onClick={onSkip}>{t("player.skipIntro")}</Chip>
}

/**
 * Everything over the video while it is "up": three bands, each on its own scrim.
 *  top     Back · what is playing (desktop / tablet; TV and phones show it in the dock) · cast, picture in picture, favorite, rotate + fullscreen (touch)
 *  centre  the transport on pointer devices: previous episode / channel, -10 s, play-pause (big), +10 s, next episode / channel. TV drives it from the remote.
 *  dock    what is playing (TV / phone) · the scrubber (VOD) · one row: transport (TV) or volume (desktop) · "ends at" · Skip intro, speed and the
 *          panel chips (Episodes / Channels, Audio & subtitles, Playback, Info, sleep) · fullscreen (desktop)
 * Paused with nothing else on screen, the dock carries the title's metadata (paused.tsx) and the centre transport steps aside.
 * `dock` = the head alone (after a zap / a new episode) or with the controls (`on`). Hidden = faded out and not focusable.
 */
export function Chrome({ p, vref, tv, touch, dock, root }: { p: P; vref: RefObject<HTMLVideoElement | null>; tv: boolean; touch: boolean; dock: boolean; root: () => HTMLElement | null }) {
  const t = useT()
  const on = p.chrome && p.layer === "none"
  const desk = !tv && !touch
  const phone = useMode() === "mobile"
  const topHead = !tv && !phone && !p.stopped // the title moves up beside Back where there is room
  const ref = useRef<HTMLDivElement>(null)

  /* the floating cards and the subtitles sit above the dock: its height (without the scrim on top) as --pl-dock on the root */
  useEffect(() => {
    const el = ref.current, r = root()
    if (!el || !r || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => r.style.setProperty("--pl-dock", `${el.offsetHeight - parseFloat(getComputedStyle(el).paddingTop)}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const play = p.E.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />
  const playLabel = p.E.paused ? t("player.play") : t("player.pause")
  const lbl = (s: string) => <span className="pl-chip-lbl">{s}</span>
  const hasPrev = p.episode && p.idx > 0
  const hasNext = p.episode && !!p.nextItem
  const nextSpeed = () => { const i = (SPEEDS as readonly number[]).indexOf(p.speed); p.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]) }
  return (
    <>
      {!tv && (
        <div data-on={on ? "" : undefined} className="pl-layer pl-top">
          <IconBtn label={t("player.back")} onClick={p.leave}><ArrowLeft className="rtl-flip" /></IconBtn>
          <div className="min-w-0 flex-1">{topHead && <Head p={p} top />}</div>
          <div className="pl-cluster">
            {touch && <IconBtn label={t("player.favorite")} on={p.isFav} onClick={p.toggleFav}><Star className={p.isFav ? "fill-current" : ""} /></IconBtn>}
            {castSupported() && <IconBtn label={t("player.cast")} on={p.casting} onClick={() => void p.cast()}><Cast /></IconBtn>}
            {p.canPip && <IconBtn label={t("player.pip")} on={p.pip} onClick={p.togglePip}><PictureInPicture2 /></IconBtn>}
            {touch && p.canTurn && <IconBtn label={t("player.rotate")} onClick={() => p.rotate(root())}><RotateCwSquare /></IconBtn>}
            {touch && <IconBtn label={t(p.fs ? "player.exitFullscreen" : "player.fullscreen")} onClick={() => p.toggleFs(root())}>{p.fs ? <Minimize /> : <Expand />}</IconBtn>}
          </div>
        </div>
      )}

      {!tv && (
        <div data-on={on && !p.stopped ? "" : undefined} dir="ltr" data-ltr className="pl-layer pl-center">
          {p.live
            ? <IconBtn label={t("player.previous")} onClick={() => p.zap(-1)}><ChevronDown /></IconBtn>
            : p.episode && <IconBtn label={t("player.prevEpisode")} onClick={p.prev} disabled={!hasPrev} className="pl-side"><SkipBack className="fill-current" /></IconBtn>}
          {!p.live && <IconBtn label={t("player.back10")} onClick={() => p.seek(-10)}><RotateCcw /></IconBtn>}
          <IconBtn size="lg" label={playLabel} onClick={p.toggle}>{play}</IconBtn>
          {!p.live && <IconBtn label={t("player.forward10")} onClick={() => p.seek(10)}><RotateCw /></IconBtn>}
          {p.live
            ? <IconBtn label={t("player.next")} onClick={() => p.zap(1)}><ChevronUp /></IconBtn>
            : p.episode && <IconBtn label={t("player.nextEpisode")} onClick={p.next} disabled={!hasNext} className="pl-side"><SkipForward className="fill-current" /></IconBtn>}
        </div>
      )}

      <div ref={ref} data-on={dock ? "" : undefined} data-controls className="pl-layer pl-dock" data-paused={p.stopped ? "" : undefined} data-tophead={topHead && on ? "" : undefined}
        onPointerEnter={() => (p.hover.current = true)} onPointerLeave={() => (p.hover.current = false)}>
        {p.stopped ? <PausedInfo p={p} /> : <Head p={p} />}
        <div data-on={on ? "" : undefined} className="pl-dock-ctrls">
          {!p.live && <Scrubber vref={vref} on={on} onSeek={p.seekTo} onToggle={p.toggle} scrubbing={p.scrubbing} />}
          <div className="pl-ctrls">
            {tv && !p.live && (
              <div dir="ltr" data-ltr data-nav-group className="pl-cluster">
                <IconBtn label={playLabel} onClick={p.toggle}>{play}</IconBtn>
                {hasPrev && <IconBtn label={t("player.prevEpisode")} onClick={p.prev}><SkipBack className="fill-current" /></IconBtn>}
                {hasNext && <IconBtn label={t("player.nextEpisode")} onClick={p.next}><SkipForward className="fill-current" /></IconBtn>}
              </div>
            )}
            {desk && (
              <div dir="ltr" data-ltr className="pl-cluster pl-volume">
                <IconBtn label={t("player.mute")} onClick={p.toggleMute}>{p.muted || !p.vol ? <VolumeX /> : <Volume2 />}</IconBtn>
                <input type="range" aria-label={t("player.volume")} min={0} max={1} step={0.05} value={p.muted ? 0 : p.vol} onChange={(e) => p.setVolume(+e.target.value, false)} className="pl-vol" />
              </div>
            )}
            {!p.live && !phone && <EndsAt vref={vref} speed={p.speed} on={on} />}
            <div data-nav-group className="pl-cluster pl-chips">
              {p.episode && <SkipIntro vref={vref} on={on} onSkip={() => p.seek(85)} />}
              {!p.live && <Chip aria-label={`${t("player.speed")} ${speedLabel(p.speed)}`} on={p.speed !== 1} icon={<Gauge />} onClick={nextSpeed}>{lbl(speedLabel(p.speed))}</Chip>}
              {p.episode && <Chip data-tabchip="episodes" aria-label={t("player.more.episodes")} icon={<ListVideo />} onClick={() => p.openPanel("episodes")}>{lbl(t("player.more.episodes"))}</Chip>}
              {p.live && <Chip data-tabchip="channels" aria-label={t("player.channels")} icon={<ListVideo />} onClick={p.openChannels}>{lbl(t("player.channels"))}</Chip>}
              <Chip data-tabchip="av" aria-label={t("player.av")} icon={<AudioLines />} dot={!!p.T.ext || p.T.subSel >= 0} onClick={() => p.openPanel("av")}>{lbl(t("player.av"))}</Chip>
              <Chip data-tabchip="playback" aria-label={t("player.tab.playback")} icon={<SlidersHorizontal />} onClick={() => p.openPanel("playback")}>{lbl(t("player.tab.playback"))}</Chip>
              <Chip data-tabchip="info" aria-label={t("player.tab.info")} icon={<Info />} onClick={() => p.openPanel("info")}>{lbl(t("player.tab.info"))}</Chip>
              {p.sleepAt && <Chip data-tabchip="playback" aria-label={t("player.sleep.title")} icon={<MoonStar />} dot onClick={() => p.openPanel("playback")}>{lbl(t("player.sleep.min", { n: p.sleepMin }))}</Chip>}
            </div>
            {desk && <IconBtn label={t(p.fs ? "player.exitFullscreen" : "player.fullscreen")} onClick={() => p.toggleFs(root())} className="ms-auto">{p.fs ? <Minimize /> : <Expand />}</IconBtn>}
          </div>
        </div>
      </div>
    </>
  )
}
