import type { ReactNode, RefObject } from "react"
import { ArrowLeft, AudioLines, Cast, ChevronDown, ChevronUp, Expand, Info, ListVideo, Minimize, MoonStar, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, SkipForward, SlidersHorizontal, Star, Volume2, VolumeX } from "lucide-react"
import { RoundButton } from "@/components/gtv"
import { castSupported } from "@/lib/cast"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Scrubber } from "./scrubber"
import type { P, Tab } from "./use-player"
import { describe } from "./util"

/** A tab chip: opens the panel on its tab (live: Channels opens the channel list). On TV Down on a chip opens it too (use-keys). */
function Chip({ icon, label, tab, onClick, active }: { icon: ReactNode; label: string; tab?: Tab | "channels"; onClick: () => void; active?: boolean }) {
  return (
    <button data-nav data-pill data-tabchip={tab} aria-label={label} onClick={onClick} className={cn("pl-chip", active && "pl-chip-on")}>
      {icon}<span className="pl-chip-lbl">{label}</span>
    </button>
  )
}

/** Round icon button on the video (back, transport, cast...). */
const Btn = ({ label, onClick, children, big, on }: { label: string; onClick: () => void; children: ReactNode; big?: boolean; on?: boolean }) => (
  <RoundButton label={label} onClick={onClick} className={cn("pl-rb pointer-events-auto", big && "pl-rb-big", on && "pl-rb-on")}>{children}</RoundButton>
)

/**
 * Everything over the video while it is "up": the title (back on pointer devices), the scrubber, and one row of tab chips.
 * TV: just those (the remote does the rest). Desktop: transport, volume and fullscreen join the row. Phone: big centred transport,
 * cast / picture-in-picture / favorite top right, icon-only chips. Hidden = faded out and not focusable.
 */
export function Chrome({ p, vref, tv, touch, root }: { p: P; vref: RefObject<HTMLVideoElement | null>; tv: boolean; touch: boolean; root: () => HTMLElement | null }) {
  const t = useT()
  const { title, sub } = describe(p.item, t)
  const on = p.chrome && p.layer === "none"
  const top = (on || (p.banner && !p.live)) && p.layer === "none" // VOD: the title also shows briefly after a change of episode
  const desk = !tv && !touch
  const chips = (
    <div data-nav-group className="pl-chips pointer-events-auto">
      {p.episode && <Chip tab="episodes" icon={<ListVideo />} label={t("player.more.episodes")} onClick={() => p.openPanel("episodes")} />}
      {p.live && <Chip tab="channels" icon={<ListVideo />} label={t("player.channels")} onClick={p.openChannels} />}
      <Chip tab="av" icon={<AudioLines />} label={t("player.av")} onClick={() => p.openPanel("av")} active={!!p.T.ext || p.T.subSel >= 0} />
      <Chip tab="playback" icon={<SlidersHorizontal />} label={t("player.tab.playback")} onClick={() => p.openPanel("playback")} />
      <Chip tab="info" icon={<Info />} label={t("player.tab.info")} onClick={() => p.openPanel("info")} />
      {p.sleepAt && <Chip tab="playback" icon={<MoonStar />} label={t("player.sleep.min", { n: p.sleepMin })} onClick={() => p.openPanel("playback")} active />}
    </div>
  )
  return (
    <>
      {/* top: back + title (+ phone / desktop actions) */}
      <div data-on={top ? "" : undefined} className="pl-layer pl-top pointer-events-none">
        <div className="flex items-start gap-3">
          {!tv && on && <Btn label={t("player.back")} onClick={p.leave}><ArrowLeft className="rtl-flip" /></Btn>}
          <div className="min-w-0 flex-1 pt-1">
            <div dir="auto" className="pl-title truncate">{title}</div>
            {sub && <div dir="auto" className="pl-sub truncate">{sub}</div>}
          </div>
          {!tv && on && (
            <div className="flex shrink-0 gap-2">
              {touch && <Btn label={t("player.favorite")} on={p.isFav} onClick={p.toggleFav}><Star className={p.isFav ? "fill-current" : ""} /></Btn>}
              {castSupported() && <Btn label={t("player.cast")} on={p.casting} onClick={() => void p.cast()}><Cast /></Btn>}
              {p.canPip && <Btn label={t("player.pip")} on={p.pip} onClick={p.togglePip}><PictureInPicture2 /></Btn>}
            </div>
          )}
        </div>
      </div>

      {/* phone: big centred transport */}
      {touch && (
        <div data-on={on ? "" : undefined} dir="ltr" data-ltr className="pl-layer pl-center pointer-events-none absolute inset-0 flex items-center justify-center gap-10">
          {p.live ? <Btn label={t("player.previous")} onClick={() => p.zap(-1)}><ChevronDown /></Btn> : <Btn label={t("player.back10")} onClick={() => p.seek(-10)}><RotateCcw /></Btn>}
          <Btn big label={p.E.paused ? t("player.play") : t("player.pause")} onClick={p.toggle}>{p.E.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</Btn>
          {p.live ? <Btn label={t("player.next")} onClick={() => p.zap(1)}><ChevronUp /></Btn> : <Btn label={t("player.forward10")} onClick={() => p.seek(10)}><RotateCw /></Btn>}
        </div>
      )}

      {/* bottom: scrubber + one row */}
      <div data-on={on ? "" : undefined} data-controls className="pl-layer pl-bottom pointer-events-none"
        onPointerEnter={() => (p.hover.current = true)} onPointerLeave={() => (p.hover.current = false)}>
        {!p.live && <Scrubber vref={vref} on={on} onSeek={p.seekTo} onToggle={p.toggle} scrubbing={p.scrubbing} />}
        <div className="pl-row">
          {desk && (
            <div dir="ltr" data-ltr className="pointer-events-auto flex items-center gap-2">
              <Btn label={p.E.paused ? t("player.play") : t("player.pause")} onClick={p.toggle}>{p.E.paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</Btn>
              {!p.live && <Btn label={t("player.back10")} onClick={() => p.seek(-10)}><RotateCcw /></Btn>}
              {!p.live && <Btn label={t("player.forward10")} onClick={() => p.seek(10)}><RotateCw /></Btn>}
              {p.episode && p.nextItem && <Btn label={t("player.nextEpisode")} onClick={p.next}><SkipForward /></Btn>}
              <Btn label={t("player.mute")} onClick={p.toggleMute}>{p.muted || !p.vol ? <VolumeX /> : <Volume2 />}</Btn>
              <input type="range" aria-label={t("player.volume")} min={0} max={1} step={0.05} value={p.muted ? 0 : p.vol} onChange={(e) => p.setVolume(+e.target.value, false)} className="pl-vol hidden lg:block" />
            </div>
          )}
          {chips}
          {desk && <div className="pointer-events-auto ms-auto"><Btn label={t("player.fullscreen")} onClick={() => p.toggleFs(root())}>{p.fs ? <Minimize /> : <Expand />}</Btn></div>}
        </div>
      </div>
    </>
  )
}

