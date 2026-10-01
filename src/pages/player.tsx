import { useCallback, useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import mpegts from "mpegts.js"
import { ArrowLeft, Captions, RotateCcw, RotateCw, Expand, Maximize, Minimize, Pause, PictureInPicture2, Play, SkipBack, SkipForward, Star, Volume1, Volume2, VolumeX } from "lucide-react"
import { Pill, RoundButton } from "@/components/gtv"
import { hm, nowNext, useCatalog } from "@/lib/catalog"
import { isTv } from "@/lib/device"
import { CORS_HINT, mixed, px, pxStream, statusMsg } from "@/lib/net"
import { KEY, navState, useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { useSourceOf } from "@/lib/sources"
import type { Item } from "@/lib/types"
import { rate, type Quality } from "@/lib/quality"
import { plexScrobble, plexStopTranscode, plexStreamUrl, plexTimeline } from "@/lib/plex"
import { jellyfinMarkPlayed, jellyfinReport, jellyfinStopTranscode, jellyfinStreamUrl } from "@/lib/jellyfin"
import { xtreamUrl } from "@/lib/xtream"
import { useHistory } from "@/lib/history"

const NONE: string[] = []
const FITS = ["contain", "cover", "fill"] as const
const FIT_LABEL = { contain: "Fit", cover: "Zoom", fill: "Stretch" }
type Track = { id: number; label: string }
const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600); return `${h ? h + ":" : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}` }

export default function Player({ queue, index }: { queue: Item[]; index: number }) {
  const back = useRoute((s) => s.back)
  const { settings, toggleFav, pushRecent, setProgress } = useApp()
  const epg = useCatalog((s) => s.epg)
  const favs = useApp((s) => (s.profileId && s.data[s.profileId]?.favs) || NONE)
  const vref = useRef<HTMLVideoElement>(null)
  const hls = useRef<Hls | null>(null)
  const [idx, setIdx] = useState(index)
  const [show, setShow] = useState(true)
  const [banner, setBanner] = useState(true)
  const [menu, setMenu] = useState<null | "audio" | "subs">(null)
  const [err, setErr] = useState("")
  const [buf, setBuf] = useState(true)
  const [paused, setPaused] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [fit, setFit] = useState(0)
  const [audio, setAudio] = useState<Track[]>([])
  const [subs, setSubs] = useState<Track[]>([])
  const [num, setNum] = useState("")
  const [retry, setRetry] = useState(0)
  const [viaHls, setViaHls] = useState("") // url whose native playback failed: some servers 302 a .mp4 to an HLS playlist
  const item = queue[idx]
  const live = item.kind === "live"
  const src = useSourceOf(item) // the item's own source (multi-source)
  const hideT = useRef(0)
  const bannerT = useRef(0)
  const numT = useRef(0)
  const resume = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const ptr = useRef("mouse")
  const tap = useRef({ t: 0, w: 0 })
  const [vol, setVol] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fs, setFs] = useState(false)
  const [pip, setPip] = useState(false)
  const [stats, setStats] = useState<{ q: Quality; bw?: number; bitrate?: number; height?: number; buf: number; dropped: number; stalls: number } | null>(null)
  const mp = useRef<mpegts.Player | null>(null)
  const stalls = useRef<number[]>([]) // timestamps of rebuffer events in the last minute
  const played = useRef(false)
  // watch-history measurements (read by the tracker below)
  const stallTotal = useRef(0)
  const errTotal = useRef(0)
  const attachAt = useRef(0)
  const startupMs = useRef<number | undefined>(undefined)
  const statsRef = useRef(stats)
  statsRef.current = stats

  const plex = src?.type === "plex" ? src : null
  const jf = src?.type === "jellyfin" ? src : null
  const raw = item.url ?? (plex ? plexStreamUrl(plex, item) : jf ? jellyfinStreamUrl(jf, item) : xtreamUrl(src!, live ? "live" : "movie", item.sid!, live ? settings.liveExt : item.ext || "mp4"))
  // Jellyfin plays DIRECT from the browser to the server (it can be on the viewer's LAN while this app is served from elsewhere,
  // e.g. over Tailscale, where the app's own proxy could not reach it). Proxy only for mixed content, when the user forces it,
  // or after a network/CORS failure (proxied flag below).
  const [proxied, setProxied] = useState("")
  const mediaServer = !!(plex || jf)
  const direct = !!jf && !mixed(raw) && !settings.proxyStreams && proxied !== raw
  const url = direct ? raw : mediaServer && mixed(raw) ? px(raw, settings.proxy) : pxStream(raw, settings)

  /* resume point + history */
  useEffect(() => {
    const p = useApp.getState().data[useApp.getState().profileId ?? ""]?.progress[item.id]
    resume.current = !live && p && p.pos > 30 && p.pos < p.dur * 0.95 ? p.pos : !live && !p && item.resume && item.resume > 30 ? item.resume : 0
    pushRecent(item.id)
    setCur(0); setDur(0); setAudio([]); setSubs([]); setBanner(true)
    clearTimeout(bannerT.current)
    bannerT.current = window.setTimeout(() => setBanner(false), 4000)
  }, [item.id, live, pushRecent])

  /* attach the right engine. Teardown is strict: the old stream must be fully closed (requests aborted, decoder released) before
     the next one opens, because many providers allow only 1-2 connections and a leftover one makes the new channel fail. */
  const firstAttach = useRef(true)
  useEffect(() => {
    const v = vref.current!
    setErr(""); setBuf(true); setStats(null)
    stalls.current = []; played.current = false
    attachAt.current = Date.now(); startupMs.current = undefined
    const isHls = viaHls === url || /\.m3u8(\?|$)/i.test(raw) || /[?&]output=m3u8/i.test(raw)
    let stop = () => {}
    const start = () => {
      if (isHls && Hls.isSupported()) {
        const h = new Hls({ maxBufferLength: 30, enableWorker: true })
        hls.current = h
        let net = 0
        h.loadSource(url); h.attachMedia(v)
        h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(() => {}))
        h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudio(h.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Audio ${i + 1}` }))))
        h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubs(h.subtitleTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Subtitle ${i + 1}` }))))
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return
          const code = d.response?.code
          const http = !!code && code >= 400 // 4xx will not fix itself: no retries
          if (direct && d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && !h.levels?.length) setProxied(raw) // direct manifest failed (CORS / unreachable): retry through the proxy once (startLoad would not refetch it)
          else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && net++ < 3) h.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && net++ < 3) h.recoverMediaError()
          else setErr(http ? statusMsg(code) : d.type === Hls.ErrorTypes.NETWORK_ERROR ? CORS_HINT : d.type === Hls.ErrorTypes.MEDIA_ERROR ? "This device can't decode the stream." : "Stream unavailable.")
        })
        stop = () => { h.stopLoad(); h.detachMedia(); h.destroy(); hls.current = null }
      } else if (live && mpegts.isSupported()) {
        const p = mpegts.createPlayer({ type: "mpegts", isLive: true, url }, { enableWorker: true, liveBufferLatencyChasing: true })
        mp.current = p
        p.attachMediaElement(v); p.load()
        void Promise.resolve(p.play()).catch(() => {})
        p.on(mpegts.Events.ERROR, (_t, _d, info: { code?: number }) => setErr(info?.code && info.code >= 400 ? statusMsg(info.code) : "Stream unavailable. The channel may be offline, or the browser blocked it (CORS)."))
        stop = () => { p.pause(); p.unload(); p.detachMediaElement(); p.destroy(); mp.current = null } // unload() aborts the open live connection
      } else {
        v.src = url
        void v.play().catch(() => {})
      }
    }
    // zapping fast (CH+ held, arrows): only the channel you settle on opens a connection
    const first = firstAttach.current
    firstAttach.current = false
    const t = live && !first ? window.setTimeout(start, 300) : (start(), 0)
    return () => {
      clearTimeout(t)
      stop()
      v.pause()
      v.removeAttribute("src") // release the decoder and any buffered/blob source
      v.load()
    }
  }, [url, live, retry, viaHls])

  /* save progress */
  useEffect(() => {
    if (live) return
    const t = setInterval(() => { const v = vref.current; if (v && v.duration > 0) setProgress(item.id, v.currentTime, v.duration) }, 10000)
    return () => { clearInterval(t); const v = vref.current; if (v && v.duration > 0) setProgress(item.id, v.currentTime, v.duration) }
  }, [item.id, live, setProgress])

  useEffect(() => { if (err) errTotal.current++ }, [err])

  /* Watch history: one session per playback, +5s while actually playing (paused/buffering time is not counted).
     Stats and the History page read this; Settings > History turns it off. */
  useEffect(() => {
    const pid = useApp.getState().profileId
    if (!settings.trackHistory || !pid) return
    const H = useHistory.getState()
    let sid = ""
    let alive = true
    stallTotal.current = 0; errTotal.current = 0
    let speedSum = 0, speedN = 0
    const kind = live ? "live" : item.id.includes("|ep|") ? "episode" : "movie"
    void H.load(pid).then(() => { if (alive) sid = useHistory.getState().start({ item: item.id, kind, name: item.name, group: item.group, logo: item.logo, src: src?.id ?? "" }) })
    const snap = () => {
      const v = vref.current
      const st = statsRef.current
      if (st?.bw) { speedSum += st.bw / 1e6; speedN++ }
      return { pos: v?.currentTime, dur: v && isFinite(v.duration) ? v.duration : undefined, stalls: stallTotal.current, errors: errTotal.current, startupMs: startupMs.current, q: st?.q, mbps: speedN ? speedSum / speedN : undefined }
    }
    const iv = setInterval(() => {
      const v = vref.current
      if (sid && v && !v.paused && v.readyState >= 3) useHistory.getState().tick(sid, 5, snap())
    }, 5000)
    return () => {
      alive = false
      clearInterval(iv)
      if (sid) useHistory.getState().patch(sid, snap())
    }
  }, [item.id, settings.trackHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Plex: timeline every 10s + on pause/play, stopped (and scrobble when >90%) on leave */
  useEffect(() => {
    const v = vref.current
    if (!plex || live || !v) return
    let pos = 0, d = 0
    const rep = (state: "playing" | "paused" | "stopped") => d > 0 && plexTimeline(plex, item, state, pos, d)
    const tick = () => { if (v.duration > 0) { pos = v.currentTime; d = v.duration } }
    const on = (state: "playing" | "paused") => () => { tick(); rep(state) }
    const t = setInterval(() => { tick(); rep(v.paused ? "paused" : "playing") }, 10000)
    const onPause = on("paused"), onPlay = on("playing")
    v.addEventListener("pause", onPause); v.addEventListener("play", onPlay); v.addEventListener("timeupdate", tick)
    return () => {
      clearInterval(t)
      v.removeEventListener("pause", onPause); v.removeEventListener("play", onPlay); v.removeEventListener("timeupdate", tick)
      rep("stopped")
      plexStopTranscode(plex, item)
      if (d > 0 && pos / d > 0.9) plexScrobble(plex, item)
    }
  }, [item.id, live, plex?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Jellyfin: start on first play, progress every 10s + on pause/play, stopped (and mark played when >90%) on leave; transcode always stopped */
  useEffect(() => {
    const v = vref.current
    if (!jf || !v) return
    if (live) return () => jellyfinStopTranscode(jf, item)
    let pos = 0, d = 0, started = false
    const tick = () => { if (v.duration > 0) { pos = v.currentTime; d = v.duration } }
    const rep = () => { tick(); if (started) jellyfinReport(jf, item, "progress", pos, v.paused) }
    const onPlay = () => { tick(); if (!started) { started = true; jellyfinReport(jf, item, "start", pos) } else rep() }
    const t = setInterval(rep, 10000)
    v.addEventListener("pause", rep); v.addEventListener("play", onPlay); v.addEventListener("timeupdate", tick)
    return () => {
      clearInterval(t)
      v.removeEventListener("pause", rep); v.removeEventListener("play", onPlay); v.removeEventListener("timeupdate", tick)
      if (started) jellyfinReport(jf, item, "stopped", pos)
      jellyfinStopTranscode(jf, item)
      if (d > 0 && pos / d > 0.9) jellyfinMarkPlayed(jf, item)
    }
    // deps on the id, not the object: a store update (sync pull, source edit) must not stop the transcode mid-play
  }, [item.id, live, jf?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const poke = useCallback(() => {
    setShow(true)
    clearTimeout(hideT.current)
    hideT.current = window.setTimeout(() => { setShow(false); setMenu(null); (document.activeElement as HTMLElement)?.blur() }, 6000)
  }, [])
  const flash = () => { setBanner(true); clearTimeout(bannerT.current); bannerT.current = window.setTimeout(() => setBanner(false), 4000) }
  const zap = useCallback((d: number) => { setIdx((i) => (i + d + queue.length) % queue.length); flash() }, [queue.length])
  const seek = (d: number) => { const v = vref.current!; v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 1e9) }
  const seekTo = (e: React.PointerEvent<HTMLElement>) => {
    const v = vref.current!, b = e.currentTarget.getBoundingClientRect()
    if (v.duration > 0) v.currentTime = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * v.duration
    poke()
  }
  const fsEl = () => document.fullscreenElement || (document as any).webkitFullscreenElement
  const toggleFs = () => {
    const el = root.current as any, d = document as any
    if (fsEl()) (d.exitFullscreen || d.webkitExitFullscreen).call(d)
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
  }
  const setVolume = (x: number) => { const v = vref.current!; v.volume = x; v.muted = x === 0 }
  const onVideoClick = (e: React.MouseEvent) => {
    if (isTv) return
    if (ptr.current === "mouse") return toggle()
    const t = tap.current, now = Date.now(), x = e.clientX / window.innerWidth
    if (!live && now - t.t < 300 && (x < 1 / 3 || x > 2 / 3)) { clearTimeout(t.w); t.t = 0; seek(x < 0.5 ? -10 : 10); return poke() }
    t.t = now
    clearTimeout(t.w)
    t.w = window.setTimeout(() => (show ? (setShow(false), setMenu(null)) : poke()), live ? 0 : 300)
  }
  const toggle = () => { const v = vref.current!; v.paused ? void v.play().catch(() => {}) : v.pause() }
  const setSub = (i: number) => {
    if (hls.current) { hls.current.subtitleTrack = i; hls.current.subtitleDisplay = i >= 0 }
    else Array.from(vref.current!.textTracks).forEach((t, j) => (t.mode = j === i ? "showing" : "disabled"))
    setMenu(null)
  }
  const pickAudio = (i: number) => { if (hls.current) hls.current.audioTrack = i; setMenu(null) }
  const openSubs = () => {
    if (!hls.current) setSubs(Array.from(vref.current!.textTracks).map((t, i) => ({ id: i, label: t.label || t.language || `Subtitle ${i + 1}` })))
    setMenu("subs")
  }

  navState.lock = !show && !menu
  useEffect(() => () => { navState.lock = false }, [])
  useEffect(() => { if (show && !menu) requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-play]")?.focus()) }, [show, menu])

  /* desktop/mobile extras: fullscreen state, idle hide, wake lock */
  useEffect(() => {
    const f = () => setFs(!!fsEl())
    document.addEventListener("fullscreenchange", f); document.addEventListener("webkitfullscreenchange", f)
    if (!isTv) poke()
    return () => { document.removeEventListener("fullscreenchange", f); document.removeEventListener("webkitfullscreenchange", f); clearTimeout(tap.current.w) }
  }, [poke])
  useEffect(() => {
    if (isTv || paused || err) return
    let l: WakeLockSentinel | null = null
    const get = () => { if (document.visibilityState === "visible") navigator.wakeLock?.request("screen").then((x) => (l = x), () => {}) }
    get(); document.addEventListener("visibilitychange", get)
    return () => { document.removeEventListener("visibilitychange", get); void l?.release() }
  }, [paused, err])

  /* remote keys */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.keyCode
      const stop = () => (e.preventDefault(), e.stopPropagation())
      const locked = navState.lock
      if (k === KEY.back || k === KEY.esc || (k === KEY.bksp && isTv)) {
        stop()
        if (!isTv && fsEl()) toggleFs()
        else if (menu) setMenu(null)
        else if (show && (isTv || k !== KEY.esc)) { setShow(false); (document.activeElement as HTMLElement)?.blur() }
        else back()
        return
      }
      if (k === KEY.play) return stop(), void vref.current!.play().catch(() => {})
      if (k === KEY.pause) return stop(), vref.current!.pause()
      if (k === KEY.stop) return stop(), void back()
      if (k === KEY.ff) return stop(), seek(30), poke()
      if (k === KEY.rw) return stop(), seek(-10), poke()
      if (k === KEY.chUp || (locked && live && k === KEY.up)) return stop(), zap(1)
      if (k === KEY.chDown || (locked && live && k === KEY.down)) return stop(), zap(-1)
      if (k === KEY.red) return stop(), toggleFav(item.id)
      if (k === KEY.green) return stop(), setMenu("audio"), poke()
      if (k === KEY.yellow) return stop(), setFit((f) => (f + 1) % FITS.length), poke()
      if (k === KEY.blue) return stop(), openSubs(), poke()
      if (k === KEY.info) return stop(), poke()
      if (k >= 48 && k <= 57 && live) {
        stop()
        setNum((n) => (n + (k - 48)).slice(-4))
        clearTimeout(numT.current)
        numT.current = window.setTimeout(() => {
          setNum((n) => { const t = queue.findIndex((q) => q.num === +n); const j = t >= 0 ? t : +n - 1; if (j >= 0 && j < queue.length) { setIdx(j); flash() } return "" })
        }, 1500)
        return
      }
      if (!isTv && !(e.target instanceof HTMLInputElement)) {
        const v = vref.current!, up = k === KEY.up ? 1 : k === KEY.down ? -1 : 0
        if (k === 32) return stop(), toggle(), poke()
        if (k === 70) return stop(), toggleFs()
        if (k === 80 && canPip) return stop(), togglePip()
        if (k === 77) return stop(), void (v.muted = !v.muted)
        if (!live && (k === KEY.left || k === KEY.right)) return stop(), seek(k === KEY.left ? -10 : 10), poke()
        if (up) return stop(), live ? zap(up) : setVolume(Math.min(1, Math.max(0, v.volume + up * 0.1))), poke()
      }
      if (locked) {
        stop()
        if (!live && k === KEY.left) seek(-10)
        else if (!live && k === KEY.right) seek(30)
        else if (k === KEY.enter && !live) toggle()
        poke()
        return
      }
      poke()
      // while controls are up, the seek bar eats left/right
      if ((document.activeElement as HTMLElement)?.dataset.seek !== undefined && (k === KEY.left || k === KEY.right)) { stop(); seek(k === KEY.left ? -10 : 30) }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  const { now, next } = live ? nowNext(epg, item.epgId) : ({} as ReturnType<typeof nowNext>)
  const next_ = () => (live ? zap(1) : idx < queue.length - 1 && setIdx(idx + 1))
  const prev_ = () => (live ? zap(-1) : idx > 0 && setIdx(idx - 1))
  const isFav = favs.includes(item.id)

  /* Picture-in-picture (desktop/Android Chrome; not on webOS) */
  const canPip = !isTv && typeof document !== "undefined" && document.pictureInPictureEnabled
  const togglePip = () => {
    const v = vref.current
    if (!v) return
    void (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {})
  }
  useEffect(() => {
    const v = vref.current
    if (!v || !canPip) return
    const on = () => setPip(true), off = () => setPip(false)
    v.addEventListener("enterpictureinpicture", on)
    v.addEventListener("leavepictureinpicture", off)
    try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, togglePip) } catch { /* not supported */ }
    return () => {
      v.removeEventListener("enterpictureinpicture", on)
      v.removeEventListener("leavepictureinpicture", off)
      if (document.pictureInPictureElement === v) void document.exitPictureInPicture().catch(() => {})
      try { navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null) } catch { /* ignore */ }
    }
  }, [canPip]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Connection quality: sampled every 2s while playing */
  useEffect(() => {
    const t = setInterval(() => {
      const v = vref.current
      if (!v || v.paused || v.readyState < 2) return
      const now = Date.now()
      stalls.current = stalls.current.filter((x) => now - x < 60000)
      let buf = 0
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) buf = v.buffered.end(i) - v.currentTime
      const h = hls.current
      const lv = h && h.currentLevel >= 0 ? h.levels[h.currentLevel] : undefined
      const speed = (mp.current?.statisticsInfo as { speed?: number } | undefined)?.speed // KB/s
      const bw = h ? h.bandwidthEstimate : speed ? speed * 8 * 1024 : undefined
      const bwOk = bw && isFinite(bw) ? bw : undefined
      const pq = v.getVideoPlaybackQuality?.()
      const dropped = pq && pq.totalVideoFrames > 60 ? (pq.droppedVideoFrames / pq.totalVideoFrames) * 100 : 0
      setStats({ q: rate({ bufAhead: buf, stalls: stalls.current.length, bw: bwOk, bitrate: lv?.bitrate }), bw: bwOk, bitrate: lv?.bitrate, height: lv?.height || v.videoHeight || undefined, buf, dropped, stalls: stalls.current.length })
    }, 2000)
    return () => clearInterval(t)
  }, [])

  const lbl = "hidden lg:inline"
  const ic = "lg:mr-1"
  return (
    <div ref={root} className={`dark fixed inset-0 bg-black text-white${!show && !isTv ? " cursor-none" : ""}`} onMouseMove={poke}>
      <video
        ref={vref}
        playsInline
        className="size-full"
        style={{ objectFit: FITS[fit] }}
        onPointerUp={(e) => (ptr.current = e.pointerType)}
        onClick={onVideoClick}
        onDoubleClick={() => !isTv && ptr.current === "mouse" && toggleFs()}
        onLoadedMetadata={(e) => { if (resume.current) e.currentTarget.currentTime = resume.current }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onVolumeChange={(e) => { setVol(e.currentTarget.volume); setMuted(e.currentTarget.muted) }}
        onWaiting={() => { setBuf(true); if (played.current) { stalls.current.push(Date.now()); stallTotal.current++ } }}
        onPlaying={() => { setBuf(false); setPaused(false); played.current = true; startupMs.current ??= Date.now() - attachAt.current }}
        onPause={() => setPaused(true)}
        onEnded={() => (idx < queue.length - 1 ? setIdx(idx + 1) : back())}
        onError={() => (!live && !hls.current && viaHls !== url && Hls.isSupported() ? setViaHls(url) : setErr(vref.current?.error?.code === 4 ? "This format isn't supported on this device." : vref.current?.error?.code === 3 ? "The stream is corrupted or can't be decoded." : "Cannot play this stream. It may be offline, or the browser blocked it (CORS)."))}
      />
      {buf && !err && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="size-16 animate-spin rounded-full border-4 border-white/30 border-t-white" /></div>}
      {num && <div className="absolute right-4 top-4 rounded-[28px] bg-black/70 px-6 py-3 text-3xl sm:right-12 sm:top-10 sm:text-5xl">{num}</div>}
      {err && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 p-4 text-center">
          <div className="max-w-2xl px-6 text-center"><div className="mb-2 text-base text-white/60">{item.name}</div><div className="text-xl font-medium sm:text-3xl">{err}</div></div>
          <div className="flex flex-wrap justify-center gap-3"><Pill variant="primary" data-autofocus="" onClick={() => setRetry((r) => r + 1)}>Retry</Pill>{queue.length > 1 && <Pill onClick={() => zap(1)}>Next</Pill>}<Pill onClick={back}>Back</Pill></div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-safe pt-safe pb-safe">
        {(show || banner) ? (
          <div className="bg-gradient-to-b from-black/90 to-transparent p-4 pb-12 sm:p-10 sm:pb-24">
            <div className="flex items-start gap-3">
              {show && !isTv && <button aria-label="Back" onClick={back} className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-black/50"><ArrowLeft className="size-6" /></button>}
              <div className="min-w-0 flex-1 text-xl font-medium sm:text-4xl">{live && item.num ? `${item.num}  ` : ""}{item.name}</div>
            </div>
            {live && now && (
              <div className="mt-3 max-w-3xl text-base sm:text-xl">
                <div>{now.t} <span className="text-white/60">{hm(now.s)} - {hm(now.e)}</span></div>
                <div className="mt-2 h-1 rounded-full bg-white/25"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ((Date.now() - now.s) / (now.e - now.s)) * 100)}%` }} /></div>
                {next && <div className="mt-2 text-white/60">Next: {next.t} ({hm(next.s)})</div>}
              </div>
            )}
          </div>
        ) : <div />}
        {show && (
          <div className="bg-gradient-to-t from-black/90 to-transparent p-4 pt-12 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-10 sm:pt-24 sm:pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            {!live && (
              <div className="pointer-events-auto mb-3 flex items-center gap-3 text-sm sm:mb-5 sm:gap-4 sm:text-lg">
                <span className="w-14 text-right sm:w-20">{mmss(cur)}</span>
                <button
                  data-nav data-seek aria-label="Seek"
                  className="flex h-8 flex-1 touch-none items-center"
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekTo(e) }}
                  onPointerMove={(e) => e.buttons && seekTo(e)}
                >
                  <div className="relative h-1 w-full rounded-full bg-white/25"><div className="h-full rounded-full bg-white [html[data-layout=netflix]_&]:bg-[#e50914]" style={{ width: `${dur ? (cur / dur) * 100 : 0}%` }} /><div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md [html[data-layout=netflix]_&]:bg-[#e50914]" style={{ left: `${dur ? (cur / dur) * 100 : 0}%` }} /></div>
                </button>
                <span className="w-14 sm:w-20">{mmss(dur)}</span>
              </div>
            )}
            {stats && <div className="mb-2 text-right text-xs text-white/60 sm:text-sm">{qualityDetail(stats)}</div>}
            {/* three zones, always in this order: transport (left) | volume | tools (right). Stacks into two centered rows on narrow screens. */}
            <div className="pointer-events-auto flex flex-col items-center gap-3 md:flex-row md:justify-between md:gap-6">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {queue.length > 1 && <RoundButton label="Previous" onClick={prev_}><SkipBack /></RoundButton>}
                <RoundButton data-play data-primary label={paused ? "Play" : "Pause"} className="size-14 bg-white text-[#1f1f1f] [&_svg]:size-7" onClick={toggle}>{paused ? <Play className="fill-current" /> : <Pause className="fill-current" />}</RoundButton>
                {!live && <RoundButton label="Back 10 seconds" className="hidden [html[data-layout=netflix]_&]:flex" onClick={() => seek(-10)}><RotateCcw /></RoundButton>}
                {!live && <RoundButton label="Forward 10 seconds" className="hidden [html[data-layout=netflix]_&]:flex" onClick={() => seek(10)}><RotateCw /></RoundButton>}
                {queue.length > 1 && <RoundButton label="Next" onClick={next_}><SkipForward /></RoundButton>}
                {!isTv && (
                  <div className="ml-1 flex items-center gap-2 sm:ml-3">
                    <RoundButton label="Mute" onClick={() => (vref.current!.muted = !muted)}>{muted || !vol ? <VolumeX /> : <Volume2 />}</RoundButton>
                    <input type="range" aria-label="Volume" min={0} max={1} step={0.05} value={muted ? 0 : vol} onChange={(e) => setVolume(+e.target.value)} className="hidden w-24 accent-primary lg:block" />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:justify-end">
                {stats && <QualityBadge s={stats} />}
                <RoundButton label="Favorite" active={isFav} onClick={() => toggleFav(item.id)}><Star className={isFav ? "fill-yellow-400 text-yellow-400" : ""} /></RoundButton>
                <Pill aria-label="Audio" className="h-12 px-3 lg:px-6" onClick={() => setMenu("audio")}><Volume1 className={ic} /><span className={lbl}>Audio</span></Pill>
                <Pill aria-label="Subtitles" className="h-12 px-3 lg:px-6" onClick={openSubs}><Captions className={ic} /><span className={lbl}>Subtitles</span></Pill>
                <Pill aria-label="Aspect" className="h-12 px-3 lg:px-6" onClick={() => setFit((f) => (f + 1) % FITS.length)}><Maximize className={ic} /><span className={lbl}>{FIT_LABEL[FITS[fit]]}</span></Pill>
                {canPip && <RoundButton label="Picture in picture" active={pip} onClick={togglePip}><PictureInPicture2 className={pip ? "text-primary" : ""} /></RoundButton>}
                {!isTv && <RoundButton label="Fullscreen" onClick={toggleFs}>{fs ? <Minimize /> : <Expand />}</RoundButton>}
              </div>
            </div>
            {isTv && <div className="mt-3 text-center text-sm text-white/60">Red favorite - Green audio - Yellow aspect - Blue subtitles</div>}
          </div>
        )}
      </div>
      {menu && (
        <div data-modal className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onAnimationStart={() => {}}>
          <div className="flex max-h-[90vh] w-[28rem] max-w-[92vw] flex-col gap-2 overflow-y-auto rounded-[28px] bg-surface p-6 shadow-2xl">
            <div className="mb-2 text-2xl font-semibold">{menu === "audio" ? "Audio" : "Subtitles"}</div>
            {menu === "subs" && <Pill data-autofocus="" className="justify-start" onClick={() => setSub(-1)}>Off</Pill>}
            {(menu === "audio" ? audio : subs).map((t) => (
              <Pill key={t.id} className="justify-start" onClick={() => (menu === "audio" ? pickAudio(t.id) : setSub(t.id))}>{t.label}</Pill>
            ))}
            {menu === "audio" && !audio.length && <div className="text-muted-foreground">Only the default audio track is available.</div>}
            {menu === "subs" && !subs.length && <div className="text-muted-foreground">No subtitle tracks in this stream.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

const QC = { good: "bg-emerald-400", fair: "bg-amber-400", poor: "bg-red-500" } as const
const QL = { good: "Good", fair: "Fair", poor: "Poor" } as const

type Stats = { q: Quality; bw?: number; bitrate?: number; height?: number; buf: number; dropped: number; stalls: number }
const mbps = (n?: number) => (n ? `${(n / 1e6).toFixed(1)} Mbps` : "")

/** The numbers behind the rating, shown above the controls while they are open. */
const qualityDetail = (s: Stats) =>
  [mbps(s.bw) && `${mbps(s.bw)} link`, mbps(s.bitrate) && `${mbps(s.bitrate)} stream`, `${s.buf.toFixed(0)}s buffered`, s.stalls ? `${s.stalls} stall${s.stalls > 1 ? "s" : ""}/min` : "", s.dropped >= 1 ? `${s.dropped.toFixed(0)}% dropped` : ""].filter(Boolean).join(" · ")

/** Three signal bars + label, sits at the end of the control row. */
function QualityBadge({ s }: { s: Stats }) {
  const on = s.q === "good" ? 3 : s.q === "fair" ? 2 : 1
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 text-sm sm:text-base" title={qualityDetail(s)} aria-label={`Connection quality: ${QL[s.q]}`}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => <span key={n} className={`w-1.5 rounded-sm ${n <= on ? QC[s.q] : "bg-white/25"}`} style={{ height: 6 + n * 4 }} />)}
      </span>
      <span>{QL[s.q]}</span>
      {s.height ? <span className="text-white/60">{s.height}p</span> : null}
    </div>
  )
}
