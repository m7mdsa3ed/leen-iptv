import { useEffect, useRef, type RefObject } from "react"
import { ArrowLeft, AudioLines, Cast, ChevronDown, ChevronUp, Expand, Info, ListVideo, Minimize, MoonStar, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, SkipForward, SlidersHorizontal, Star, Volume2, VolumeX } from "lucide-react"
import { castSupported } from "@/lib/cast"
import { useT } from "@/lib/i18n"
import { LiveHead } from "./live"
import { Scrubber } from "./scrubber"
import { Chip, IconBtn } from "./ui"
import type { P } from "./use-player"
import { describe } from "./util"

/** What is playing, VOD: the title (series for an episode) over its line (S1 E3 · episode title / year · category). */
function Head({ p }: { p: P }) {
  const t = useT()
  if (p.live) return <LiveHead item={p.item} />
  const { title, sub } = describe(p.item, t)
  return (
    <div className="pl-head">
      <div dir="auto" className="pl-title pl-trunc">{title}</div>
      {sub && <div dir="auto" className="pl-sub pl-trunc">{sub}</div>}
    </div>
  )
}

/**
 * Everything over the video while it is "up", one layout on every device:
 *  top (pointer devices only): back · cast / picture in picture / favorite
 *  dock (bottom): what is playing · the scrubber (VOD) · one row = transport (desktop) | tab chips | volume + fullscreen (desktop)
 *  phone: the big transport in the centre, chips as icons
 * `dock` = the head alone (after a zap / a new episode) or with the controls (`on`). Hidden = faded out and not focusable.
 */
export function Chrome({ p, vref, tv, touch, dock, root }: { p: P; vref: RefObject<HTMLVideoElement | null>; tv: boolean; touch: boolean; dock: boolean; root: () => HTMLElement | null }) {
  const t = useT()
  const on = p.chrome && p.layer === "none"
  const desk = !tv && !touch
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
  return (
    <>
      {!tv && (
        <div data-on={on ? "" : undefined} className="pl-layer pl-top">
          <IconBtn label={t("player.back")} onClick={p.leave}><ArrowLeft className="rtl-flip" /></IconBtn>
          <div className="pl-cluster ms-auto">
            {touch && <IconBtn label={t("player.favorite")} on={p.isFav} onClick={p.toggleFav}><Star className={p.isFav ? "fill-current" : ""} /></IconBtn>}
            {castSupported() && <IconBtn label={t("player.cast")} on={p.casting} onClick={() => void p.cast()}><Cast /></IconBtn>}
            {p.canPip && <IconBtn label={t("player.pip")} on={p.pip} onClick={p.togglePip}><PictureInPicture2 /></IconBtn>}
          </div>
        </div>
      )}

      {touch && (
        <div data-on={on ? "" : undefined} dir="ltr" data-ltr className="pl-layer pl-center">
          {p.live ? <IconBtn label={t("player.previous")} onClick={() => p.zap(-1)}><ChevronDown /></IconBtn> : <IconBtn label={t("player.back10")} onClick={() => p.seek(-10)}><RotateCcw /></IconBtn>}
          <IconBtn size="lg" label={playLabel} onClick={p.toggle}>{play}</IconBtn>
          {p.live ? <IconBtn label={t("player.next")} onClick={() => p.zap(1)}><ChevronUp /></IconBtn> : <IconBtn label={t("player.forward10")} onClick={() => p.seek(10)}><RotateCw /></IconBtn>}
        </div>
      )}

      <div ref={ref} data-on={dock ? "" : undefined} data-controls className="pl-layer pl-dock"
        onPointerEnter={() => (p.hover.current = true)} onPointerLeave={() => (p.hover.current = false)}>
        <Head p={p} />
        <div data-on={on ? "" : undefined} className="pl-dock-ctrls">
          {!p.live && <Scrubber vref={vref} on={on} onSeek={p.seekTo} onToggle={p.toggle} scrubbing={p.scrubbing} />}
          <div className="pl-ctrls">
            {desk && (
              <div dir="ltr" data-ltr className="pl-cluster">
                <IconBtn label={playLabel} onClick={p.toggle}>{play}</IconBtn>
                {p.live ? (
                  <>
                    <IconBtn label={t("player.previous")} onClick={() => p.zap(-1)}><ChevronDown /></IconBtn>
                    <IconBtn label={t("player.next")} onClick={() => p.zap(1)}><ChevronUp /></IconBtn>
                  </>
                ) : (
                  <>
                    <IconBtn label={t("player.back10")} onClick={() => p.seek(-10)}><RotateCcw /></IconBtn>
                    <IconBtn label={t("player.forward10")} onClick={() => p.seek(10)}><RotateCw /></IconBtn>
                  </>
                )}
                {p.episode && p.nextItem && <IconBtn label={t("player.nextEpisode")} onClick={p.next}><SkipForward /></IconBtn>}
              </div>
            )}
            <div data-nav-group className="pl-cluster">
              {p.episode && <Chip data-tabchip="episodes" aria-label={t("player.more.episodes")} icon={<ListVideo />} onClick={() => p.openPanel("episodes")}>{lbl(t("player.more.episodes"))}</Chip>}
              {p.live && <Chip data-tabchip="channels" aria-label={t("player.channels")} icon={<ListVideo />} onClick={p.openChannels}>{lbl(t("player.channels"))}</Chip>}
              <Chip data-tabchip="av" aria-label={t("player.av")} icon={<AudioLines />} dot={!!p.T.ext || p.T.subSel >= 0} onClick={() => p.openPanel("av")}>{lbl(t("player.av"))}</Chip>
              <Chip data-tabchip="playback" aria-label={t("player.tab.playback")} icon={<SlidersHorizontal />} onClick={() => p.openPanel("playback")}>{lbl(t("player.tab.playback"))}</Chip>
              <Chip data-tabchip="info" aria-label={t("player.tab.info")} icon={<Info />} onClick={() => p.openPanel("info")}>{lbl(t("player.tab.info"))}</Chip>
              {p.sleepAt && <Chip data-tabchip="playback" aria-label={t("player.sleep.title")} icon={<MoonStar />} dot onClick={() => p.openPanel("playback")}>{lbl(t("player.sleep.min", { n: p.sleepMin }))}</Chip>}
            </div>
            {desk && (
              <div className="pl-cluster ms-auto">
                <IconBtn label={t("player.mute")} onClick={p.toggleMute}>{p.muted || !p.vol ? <VolumeX /> : <Volume2 />}</IconBtn>
                <input type="range" aria-label={t("player.volume")} min={0} max={1} step={0.05} value={p.muted ? 0 : p.vol} onChange={(e) => p.setVolume(+e.target.value, false)} className="pl-vol hidden lg:block" />
                <IconBtn label={t("player.fullscreen")} onClick={() => p.toggleFs(root())}>{p.fs ? <Minimize /> : <Expand />}</IconBtn>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
