import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { isTv } from "@/lib/device"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { groupKey, srcOfId } from "@/lib/merge-pure"
import { useNotify } from "@/lib/notify"
import { castStart, castStop } from "@/lib/cast"
import { useMulti } from "@/lib/multi"
import { useCatalog } from "@/lib/catalog"
import { STREAM_QS, type StreamQ } from "@/lib/quality"
import { plexStopTranscode } from "@/lib/plex"
import { jellyfinStopTranscode } from "@/lib/jellyfin"
import { fmt, useT } from "@/lib/i18n"
import { askPin } from "@/components/tv/ui"
import type { NewEpisodesEvent } from "@/lib/new-episodes"
import type { Item } from "@/lib/types"
import { closePlayer, usePlayerHost } from "./host"
import { FITS, prefs, setPrefs } from "./prefs"
import { setMark } from "./skip-pure"
import { useFlash } from "./indicators"
import { usePlayback } from "./use-playback"
import { useSegments } from "./use-segments"
import { useNextUp } from "./use-next-up"
import { useSidecar } from "./use-sidecar"
import { useSource, type Picked } from "./use-source"
import { useTracking } from "./use-tracking"
import { useTracks } from "./use-tracks"
import { BANNER_MS, fsEl, HIDE_MS, isEpisode, mmss } from "./util"

/** What covers the video: nothing, the tabbed panel, or (live) the channel list. Exactly one at a time. */
export type Layer = "none" | "panel" | "channels"
export type Tab = "episodes" | "av" | "playback" | "info"

// ponytail: module-level so the picked quality carries to the next episode; resets to Original on reload
let lastQ: StreamQ = STREAM_QS[0]

/** PIN-aware: run fn now, or after the profile PIN when the item's category is locked. */
export function useGuard() {
  const p = useApp((s) => s.profiles.find((x) => x.id === s.profileId))
  return (i: Item, fn: () => void) => {
    if (p?.pin && p.locked.includes(`${i.kind}|${i.group}`)) void askPin(p.pin).then((ok) => ok && fn())
    else fn()
  }
}

/**
 * The player's controller: the queue (episodes / the channels of a category), playback, tracks, preferences and what is on screen.
 * The screen (player.tsx) only renders this; the keys (use-keys.ts) only call it.
 *  - chrome: title + scrubber + tab chips, auto-hidden after HIDE_MS unless paused, scrubbing, hovered or a layer is open
 *  - layer: the panel (tabs: episodes / audio & subtitles / playback / info) or the live channel list
 *  - banner: the title / channel banner after a change of item, for BANNER_MS
 */
export function usePlayer(o: { queue: Item[]; index: number; start?: boolean; mini: boolean; vref: RefObject<HTMLVideoElement | null> }) {
  const { vref, mini } = o
  const t = useT()
  const back = useRoute((s) => s.back)
  const guard = useGuard()

  /* ---------- queue ---------- */
  const [queue, setQueue] = useState(o.queue)
  const [idx, setIdx] = useState(o.index)
  const item = queue[idx]
  const qref = useRef(queue), idxRef = useRef(idx)
  qref.current = queue; idxRef.current = idx

  /* ---------- playback ---------- */
  const [q, setQ] = useState<StreamQ>(lastQ)
  const [pick, setPick] = useState<Picked & { id: string }>({ id: "" }) // media-server track picks, tagged with their item
  const picked: Picked = pick.id === item.id ? pick : {}
  const S = useSource(item, q, picked)
  const resume = useRef(0)
  const E = usePlayback({ vref, item, live: S.live, raw: S.raw, url: S.url, direct: S.direct, toProxy: S.toProxy, src: S.src, fallback: S.fallback && (() => { const v = vref.current; if (v && v.currentTime > 0) resume.current = v.currentTime; S.fallback!() }) })
  const fromStart = useRef(o.start ? item.id : "")
  useTracking({ vref, item, live: S.live, src: S.src, plex: S.plex, jf: S.jf, resume, fromStart, meas: E.meas, statsRef: E.statsRef })
  const [flash, fire] = useFlash()
  const T = useTracks({ vref, item, S, E, picked, setPicked: (p) => setPick({ ...p, id: item.id }), resume, onAuto: (name) => fire("sub", name) })
  useSidecar(vref, T.sidecar, T.offset ?? 0)

  const live = S.live
  const episode = !live && isEpisode(item.id)
  const marks = useApp((s) => s.settings.skipMarks), mk = groupKey(item.group)
  const sg = useSegments({ vref, item, live, plex: S.plex, jf: S.jf, mark: marks?.[mk] })
  const hasNext = episode && idx < queue.length - 1
  const nextBanner = useApp((s) => s.settings.nextBanner ?? true), autoAll = useApp((s) => s.settings.autoNext ?? true)
  const noAuto = useApp((s) => s.settings.noAutoShows) ?? [], showKey = item.series ?? item.group
  const autoNext = autoAll && !noAuto.includes(showKey)
  const advance = () => { setIdx((i) => Math.min(i + 1, qref.current.length - 1)); showBanner() }
  const nu = useNextUp({ vref, enabled: hasNext && nextBanner, itemId: item.id, onNext: advance, auto: autoNext, creditsAt: sg.creditsAt })
  const nextOn = hasNext && nu.show
  const skipOn = !!sg.seg && !nextOn // credits give way to the Next card

  /* ---------- what is on screen ---------- */
  const [chrome, setChrome] = useState(true)
  const [layer, setLayerState] = useState<Layer>("none")
  const [tab, setTab] = useState<Tab>(episode ? "episodes" : "av")
  const [banner, setBanner] = useState(true)
  const layerRef = useRef<Layer>("none")
  const setLayer = (l: Layer) => { layerRef.current = l; setLayerState(l) }
  const hideT = useRef(0), bannerT = useRef(0)
  const hover = useRef(false), scrubbing = useRef(false)
  const hold = useRef(false)
  hold.current = E.paused || layer !== "none" || !!E.err
  const idle = useCallback(() => {
    if (hold.current || hover.current || scrubbing.current) return
    setChrome(false)
    const a = document.activeElement as HTMLElement | null
    if (!a?.closest("[data-next],[data-modal]")) a?.blur() // the Next card and dialogs keep the D-pad
  }, [])
  /** Show the chrome and restart its countdown. */
  const poke = useCallback(() => {
    if (layerRef.current !== "none") return
    setChrome(true)
    clearTimeout(hideT.current)
    hideT.current = window.setTimeout(idle, HIDE_MS)
  }, [idle])
  const hide = () => { clearTimeout(hideT.current); setChrome(false); (document.activeElement as HTMLElement | null)?.blur() }
  useEffect(() => { if (chrome && !hold.current) poke() }, [E.paused, layer]) // eslint-disable-line react-hooks/exhaustive-deps -- also on mount: the chrome up at start hides by itself
  const showBanner = useCallback(() => { setBanner(true); clearTimeout(bannerT.current); bannerT.current = window.setTimeout(() => setBanner(false), BANNER_MS) }, [])
  useEffect(() => { showBanner() }, [item.id, showBanner])
  useEffect(() => () => { clearTimeout(hideT.current); clearTimeout(bannerT.current) }, [])

  /** Open the panel on a tab (default: the last one, else the most useful one for this kind). */
  const openPanel = (to?: Tab) => {
    if (E.err || mini) return
    clearTimeout(hideT.current)
    setTab(to ?? (tab === "episodes" && !episode ? "av" : tab))
    setLayer("panel"); setChrome(false)
  }
  const openChannels = () => { if (!live || E.err || mini) return; clearTimeout(hideT.current); setLayer("channels"); setChrome(false) }
  /** Close the layer; the chrome comes back on the control that opened it (TV) or simply comes back (pointer). */
  const closeLayer = () => { if (layerRef.current === "none") return; setLayer("none"); poke() }
  useEffect(() => { if (E.err) setLayer("none") }, [E.err])

  /* ---------- transport ---------- */
  const play = () => { void vref.current?.play().catch(() => {}); fire("play") }
  const pause = () => { vref.current?.pause(); fire("pause") }
  const toggle = () => (vref.current?.paused ? play() : pause())
  const seek = (d: number) => {
    const v = vref.current
    if (!v || live) return
    v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 1e9)
    fire(d < 0 ? "back" : "fwd", `${d < 0 ? "-" : "+"}${fmt.digits(Math.abs(d))}`)
  }
  const seekTo = (f: number) => { const v = vref.current; if (v && v.duration > 0) v.currentTime = f * v.duration }

  /** Tune / switch to another queue position; a different category honours its PIN lock. */
  const go = useCallback((j: number) => {
    const qq = qref.current, to = qq[j]
    if (!to) return
    const run = () => { setIdx(j); showBanner() }
    if (to.group !== qq[idxRef.current]?.group) guardRef.current(to, run)
    else run()
  }, [showBanner])
  const guardRef = useRef(guard)
  guardRef.current = guard
  const zap = useCallback((d: number) => { const n = qref.current.length; go((idxRef.current + d + n) % n) }, [go])
  const next = () => (live ? zap(1) : idx < queue.length - 1 && go(idx + 1))
  const prev = () => (live ? zap(-1) : idx > 0 && go(idx - 1))
  /** Play another item: in the queue already (an episode, a channel of the list) or a new queue; the route follows so a refresh keeps it. */
  const playItem = (i: Item, list?: Item[]) => {
    const k = qref.current.findIndex((x) => x.id === i.id)
    if (k >= 0) { go(k); return }
    const nq = list && list.some((x) => x.id === i.id) ? list : [i]
    const j = nq.findIndex((x) => x.id === i.id)
    guard(i, () => {
      setQueue(nq); setIdx(j); showBanner()
      useRoute.getState().replace("player", { queue: nq, index: j })
    })
  }

  /* typed channel number (live) */
  const [num, setNum] = useState("")
  const numRef = useRef(""), numT = useRef(0)
  const digit = (d: number) => {
    numRef.current = (numRef.current + d).slice(-4)
    setNum(numRef.current)
    clearTimeout(numT.current)
    numT.current = window.setTimeout(() => {
      const n = numRef.current, qq = qref.current
      numRef.current = ""; setNum("")
      const k = qq.findIndex((x) => x.num === +n)
      const j = k >= 0 ? k : +n - 1
      if (j >= 0 && j < qq.length) go(j)
    }, 1500)
  }
  useEffect(() => () => clearTimeout(numT.current), [])

  /* ---------- volume, picture, speed, quality, sleep ---------- */
  const [vol, setVolState] = useState(() => prefs().vol)
  const [muted, setMuted] = useState(() => prefs().muted)
  useEffect(() => { const v = vref.current, p = prefs(); if (v) { v.volume = p.vol; v.muted = p.muted } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onVolumeChange = () => { const v = vref.current; if (!v) return; setVolState(v.volume); setMuted(v.muted); setPrefs({ vol: v.volume, muted: v.muted }) }
  const setVolume = (x: number, show = true) => {
    const v = vref.current
    if (!v) return
    v.volume = Math.min(1, Math.max(0, x)); v.muted = v.volume === 0
    if (show) fire(v.muted ? "mute" : "vol", v.muted ? "" : `${fmt.digits(Math.round(v.volume * 100))}%`)
  }
  const toggleMute = () => {
    const v = vref.current
    if (!v) return
    if (v.muted || v.volume === 0) { v.muted = false; if (v.volume === 0) v.volume = 0.5 } else v.muted = true
    fire(v.muted ? "mute" : "vol", v.muted ? "" : `${fmt.digits(Math.round(v.volume * 100))}%`)
  }
  const [fit, setFitState] = useState(() => prefs().fit)
  const setFit = (i: number) => { setFitState(i); setPrefs({ fit: i }) }
  const [speed, setSpeedState] = useState(() => prefs().speed)
  const setSpeed = (n: number) => { const v = vref.current; if (v) { v.defaultPlaybackRate = n; v.playbackRate = n } setSpeedState(n); setPrefs({ speed: n }) }
  const setQuality = (nq: StreamQ) => {
    if (nq.id === q.id) return
    const v = vref.current
    if (v && v.currentTime > 0) resume.current = v.currentTime // the new stream resumes where this one is
    if (S.plex) plexStopTranscode(S.plex, item)
    if (S.jf) jellyfinStopTranscode(S.jf, item)
    setQ((lastQ = nq))
  }
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [sleepMin, setSleepMin] = useState(0)
  const setSleep = (n: number) => { setSleepMin(n); setSleepAt(n ? Date.now() + n * 60000 : null); fire("clock", n ? t("player.sleep.min", { n }) : t("player.off")) }

  /* ---------- favorites, marks, auto-play per show ---------- */
  const isFav = useApp((s) => !!s.profileId && !!s.data[s.profileId]?.favs.includes(item.id))
  const toggleFav = () => useApp.getState().toggleFav(item.id)
  const toggleShowAuto = () => useApp.getState().setSettings({ noAutoShows: noAuto.includes(showKey) ? noAuto.filter((k) => k !== showKey) : [...noAuto, showKey] })
  const hasMarks = !!marks?.[mk]
  const mark = (k: "is" | "ie" | "ce" | "reset") => {
    const v = vref.current, st = useApp.getState(), cur = st.settings.skipMarks ?? {}, toast = useNotify.getState().push
    if (k === "reset") { const rest = { ...cur }; delete rest[mk]; st.setSettings({ skipMarks: rest }); return toast({ title: t("player.mark.cleared") }) }
    const m = v && setMark(cur[mk], k, v.currentTime, v.duration || 0)
    if (!m) return toast({ title: t("player.mark.bad"), body: t("player.mark.badHint") })
    st.setSettings({ skipMarks: { ...cur, [mk]: m } })
    toast({ title: t("player.mark.saved", { time: mmss(v!.currentTime) }), body: t(`player.mark.${k}`) })
  }

  /* live: grouped variants of this channel (Settings > Sources > Group channel versions) */
  const vp = useCatalog((s) => (live ? s.primaryOf.get(item.id) ?? s.byId.get(item.id) : undefined))
  const sources = useApp((s) => s.sources)
  const variants = vp?.alts?.length ? [vp, ...vp.alts].map((v) => ({ item: v, src: sources.length > 1 ? sources.find((x) => x.id === srcOfId(v.id))?.name : undefined })) : []
  const pickVariant = (v: Item) => playItem(v, queue.map((x, i) => (i === idx ? v : x)))

  /* ---------- screen: fullscreen, picture in picture, cast, multiview ---------- */
  const [fs, setFs] = useState(false)
  useEffect(() => {
    const f = () => setFs(!!fsEl())
    document.addEventListener("fullscreenchange", f); document.addEventListener("webkitfullscreenchange", f)
    return () => { document.removeEventListener("fullscreenchange", f); document.removeEventListener("webkitfullscreenchange", f) }
  }, [])
  const exitFs = () => { const d = document as unknown as Record<string, (() => Promise<void> | void) | undefined>; void Promise.resolve((d.exitFullscreen || d.webkitExitFullscreen)?.call(document)).catch(() => {}) }
  // the request can reject silently: try the player, then the page, then the <video>'s own fullscreen (iOS)
  const toggleFs = (rootEl?: HTMLElement | null) => {
    if (fsEl()) return exitFs()
    type Fs = { requestFullscreen?: () => Promise<void> | void; webkitRequestFullscreen?: () => void; webkitEnterFullscreen?: () => void }
    const req = (el: Element | null | undefined) => { const e = el as unknown as Fs | null; const f = e?.requestFullscreen || e?.webkitRequestFullscreen; return f ? Promise.resolve(f.call(e)) : Promise.reject(new Error("unsupported")) }
    req(rootEl).catch(() => req(document.documentElement)).catch(() => (vref.current as unknown as Fs | null)?.webkitEnterFullscreen?.())
  }
  useEffect(() => () => { if (fsEl() === document.documentElement) exitFs() }, [])
  const canPip = !isTv && typeof document !== "undefined" && !!document.pictureInPictureEnabled
  const [pip, setPip] = useState(false)
  const togglePip = () => { const v = vref.current; if (v) void (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {}) }
  useEffect(() => {
    const v = vref.current
    if (!v || !canPip) return
    const on = () => setPip(true), off = () => setPip(false)
    v.addEventListener("enterpictureinpicture", on); v.addEventListener("leavepictureinpicture", off)
    try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, togglePip) } catch { /* not supported */ }
    return () => {
      v.removeEventListener("enterpictureinpicture", on); v.removeEventListener("leavepictureinpicture", off)
      if (document.pictureInPictureElement === v) void document.exitPictureInPicture().catch(() => {})
      try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null) } catch { /* ignore */ }
    }
  }, [canPip]) // eslint-disable-line react-hooks/exhaustive-deps
  const [casting, setCasting] = useState(false)
  const cast = async () => {
    const toast = useNotify.getState().push
    if (casting) { castStop(); setCasting(false); return toast({ title: t("player.cast.stopped") }) } // ponytail: a session ended from the TV side is not noticed; the next press resets
    try {
      const dev = await castStart({ url: S.url, raw: S.raw, title: item.name, image: item.logo, live, at: vref.current?.currentTime ?? 0 })
      vref.current?.pause(); setCasting(true); toast({ title: t("player.cast.to", { name: dev }) })
    } catch (e) {
      const m = e instanceof Error ? e.message : ""
      if (m !== "cancel") toast({ title: t("player.cast.failed"), body: m === "unavailable" ? t("player.cast.unavailable") : m })
    }
  }
  const multi = () => { useMulti.getState().add(item.id); useRoute.getState().go("multi") }
  // leaving for another page keeps playback in the mini player (player/host.tsx)
  const details = (id: string) => useRoute.getState().replace("detail", { id })
  const person = (c: { id?: string; name: string }) => useRoute.getState().replace("person", { id: c.id, name: c.name })

  /* ---------- session: stop, sleep, wake lock, host, new episodes ---------- */
  const stop = () => { if (!mini) back(); closePlayer() } // for good: no mini player
  const stopRef = useRef(stop)
  stopRef.current = stop
  useEffect(() => {
    if (!sleepAt) return
    const id = window.setTimeout(() => { vref.current?.pause(); setSleepMin(0); setSleepAt(null); stopRef.current() }, Math.max(0, sleepAt - Date.now()))
    return () => clearTimeout(id)
  }, [sleepAt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isTv || E.paused || E.err) return
    let l: WakeLockSentinel | null = null
    const get = () => { if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((x) => (l = x), () => {}) }
    get(); document.addEventListener("visibilitychange", get)
    return () => { document.removeEventListener("visibilitychange", get); void l?.release() }
  }, [E.paused, E.err])
  useEffect(() => { usePlayerHost.setState({ cur: { queue, index: idx } }) }, [queue, idx])
  useEffect(() => { usePlayerHost.setState({ canMini: E.started && !E.err }) }, [E.started, E.err])
  useEffect(() => { usePlayerHost.setState({ pip }) }, [pip]) // the browser's PiP window is open: the mini box hides
  useEffect(() => { if (mini && E.err) closePlayer() }, [mini, E.err]) // a dead stream does not linger in the corner
  useEffect(() => {
    if (mini) { setLayer("none"); hide(); if (fsEl()) exitFs() } else poke()
  }, [mini]) // eslint-disable-line react-hooks/exhaustive-deps
  // a new episode of the playing show (lib/new-episodes.ts) joins the queue, so the Next card picks it up
  useEffect(() => {
    const f = (e: Event) => {
      const { series, items } = (e as NewEpisodesEvent).detail
      setQueue((qq) => (qq.some((i) => i.series === series) ? [...qq, ...items.filter((n) => !qq.some((i) => i.id === n.id))] : qq))
    }
    window.addEventListener("leen:episodes", f)
    return () => window.removeEventListener("leen:episodes", f)
  }, [])

  /* ---------- <video> events the player owns ---------- */
  const video = {
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget
      if (resume.current) v.currentTime = resume.current
      v.defaultPlaybackRate = v.playbackRate = live ? 1 : speed
    },
    onVolumeChange: onVolumeChange,
    onEnded: () => {
      if (idx < queue.length - 1) { if (!hasNext || (autoNext && !nu.blocked.current)) advance(); else poke() } // Cancel on the Next card also stops the auto-advance
      else stop()
    },
    ...E.handlers,
  }

  return {
    item, queue, idx, live, episode, S, E, T,
    chrome, layer, tab, setTab, banner, num, flash, hover, scrubbing,
    poke, hide, openPanel, openChannels, closeLayer,
    play, pause, toggle, seek, seekTo, zap, next, prev, go, playItem, digit, stop, leave: back,
    vol, muted, setVolume, toggleMute, fit, setFit, cycleFit: () => setFit((fit + 1) % FITS.length), speed, setSpeed, q, setQuality, sleepMin, sleepAt, setSleep,
    isFav, toggleFav, mark, hasMarks, autoAll, autoNext, toggleShowAuto, variants, pickVariant,
    fs, toggleFs, canPip, pip, togglePip, casting, cast, multi, details, person,
    seg: skipOn ? sg.seg : null, skip: sg.skip, nextOn, nextItem: queue[idx + 1], nu,
    video, guard,
  }
}
export type P = ReturnType<typeof usePlayer>
