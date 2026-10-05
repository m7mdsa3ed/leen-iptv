import { useEffect, useRef, useState, type RefObject } from "react"
import Hls from "hls.js"
import mpegts from "mpegts.js"
import { useApp } from "@/lib/store"
import { connInfo } from "@/lib/xtream"
import { corsHint, statusMsg } from "@/lib/net"
import { rate } from "@/lib/quality"
import { t as tn } from "@/lib/i18n"
import type { Item, Source } from "@/lib/types"
import { audioLabel, type Stats } from "./stats"

export type Track = { id: number; label: string; detail?: string; flags?: string[] }

/** hls.js / mpegts.js / native <video> for one item, plus the connection-quality sampler and the video event handlers that feed it.
    Teardown is strict: the old stream must be fully closed (requests aborted, decoder released) before the next one opens, because many
    providers allow only 1-2 connections and a leftover one makes the new channel fail. */
export function useEngine(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; raw: string; url: string; direct: boolean; setProxied: (u: string) => void; src?: Source | null; fallback?: () => void }) {
  const { vref, item, live, raw, url, direct, setProxied, src, fallback } = o
  const proxy = useApp((s) => s.settings.proxy)
  const hls = useRef<Hls | null>(null)
  const mp = useRef<mpegts.Player | null>(null)
  const [err, setErr] = useState("")
  const [buf, setBuf] = useState(true)
  const [started, setStarted] = useState(false) // first frame played (loading screen vs rebuffering)
  const [paused, setPaused] = useState(false)
  const [audio, setAudio] = useState<Track[]>([])
  const [subs, setSubs] = useState<Track[]>([])
  const [retry, setRetry] = useState(0)
  const [viaHls, setViaHls] = useState("") // url whose native playback failed: some servers 302 a .mp4 to an HLS playlist
  const [stats, setStats] = useState<Stats | null>(null)
  const auto = useRef(0) // automatic restarts since the last good playback (watchdog, mpegts errors, resume); capped so a dead stream still reaches the error screen
  const timers = useRef<number[]>([])
  const gen = useRef(0)
  const stalls = useRef<number[]>([]) // timestamps of rebuffer events in the last minute
  const played = useRef(false)
  // watch-history measurements (read by the tracker)
  const meas = useRef({ stallTotal: 0, errTotal: 0, attachAt: 0, startupMs: undefined as number | undefined })
  const statsRef = useRef(stats)
  const aud = useRef<{ codec?: string; ch?: number }>({}) // audio as demuxed (hls.js / mpegts.js); unknown for native <video>
  statsRef.current = stats

  useEffect(() => { setAudio([]); setSubs([]) }, [item.id])
  useEffect(() => { auto.current = 0 }, [url, live])

  /** Final playback error. A refused stream on an Xtream account that is at its connection limit gets the real reason. */
  const fail = (msg: string, refusal = true) => {
    const g = gen.current
    if (!refusal || src?.type !== "xtream") return setErr(msg)
    void connInfo(src, proxy).then((c) => { if (g === gen.current) setErr(c && c.act >= c.max ? tn("errors.maxConn", { act: c.act, max: c.max }) : msg) })
  }
  const again = (ms: number) => { timers.current.push(window.setTimeout(() => setRetry((r) => r + 1), ms)) }

  const firstAttach = useRef(true)
  useEffect(() => {
    const v = vref.current!
    gen.current++
    setErr(""); setBuf(true); setStarted(false); setStats(null); aud.current = {}
    stalls.current = []; played.current = false
    meas.current.attachAt = Date.now(); meas.current.startupMs = undefined
    const isHls = viaHls === url || /\.m3u8(\?|$)/i.test(raw) || /[?&]output=m3u8/i.test(raw)
    let stop = () => {}
    const start = () => {
      if (isHls && Hls.isSupported()) {
        const h = new Hls({ maxBufferLength: 30, enableWorker: true })
        hls.current = h
        let net = 0
        h.loadSource(url); h.attachMedia(v)
        h.on(Hls.Events.BUFFER_CODECS, (_e, d) => { const a = d.audio ?? d.audiovideo; if (a?.codec) aud.current = { codec: a.codec, ch: a.metadata?.channelCount } })
        h.on(Hls.Events.FRAG_BUFFERED, () => { net = 0 }) // retries are per outage, not per session
        h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(() => {}))
        h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudio(h.audioTracks.map((x, i) => ({ id: i, label: x.name || x.lang || tn("player.audioTrack", { n: i + 1 }), detail: [x.lang, x.audioCodec, x.channels].filter(Boolean).join(" · ") || undefined, flags: x.default ? [tn("player.track.default")] : [] }))))
        h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubs(h.subtitleTracks.map((x, i) => ({ id: i, label: x.name || x.lang || tn("player.subtitleTrack", { n: i + 1 }), detail: x.lang || undefined, flags: [x.default ? "default" : "", /forced/i.test(x.characteristics || "") ? "forced" : "", /hearing.?impaired|\bsd[hx]\b/i.test(x.characteristics || "") ? "sdh" : ""].filter(Boolean) }))))
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return
          const code = d.response?.code
          const http = !!code && code >= 400 // 4xx will not fix itself: no retries
          if (direct && d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && !h.levels?.length) setProxied(raw) // direct manifest failed (CORS / unreachable): retry through the proxy once (startLoad would not refetch it)
          else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && net++ < 3) h.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && net++ < 3) h.recoverMediaError()
          else fail(http ? statusMsg(code) : d.type === Hls.ErrorTypes.NETWORK_ERROR ? corsHint() : d.type === Hls.ErrorTypes.MEDIA_ERROR ? tn("errors.stream.decode") : tn("errors.stream.unavailable"))
        })
        stop = () => { h.stopLoad(); h.detachMedia(); h.destroy(); hls.current = null }
      } else if (live && mpegts.isSupported()) {
        const p = mpegts.createPlayer({ type: "mpegts", isLive: true, url }, { enableWorker: true, liveBufferLatencyChasing: true })
        mp.current = p
        p.attachMediaElement(v); p.load()
        p.on(mpegts.Events.MEDIA_INFO, (mi: { audioCodec?: string; audioChannelCount?: number }) => { if (mi.audioCodec) aud.current = { codec: mi.audioCodec, ch: mi.audioChannelCount } })
        void Promise.resolve(p.play()).catch(() => {})
        p.on(mpegts.Events.ERROR, (_t, _d, info: { code?: number }) => {
          const http = !!info?.code && info.code >= 400
          if (!http && auto.current++ < 3) again(1000 * auto.current)
          else fail(http ? statusMsg(info.code!) : tn("errors.stream.offline"))
        })
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
    // watchdog: a provider that accepts the connection but sends nothing raises no error, so restart (twice), then give up
    const wd = window.setTimeout(() => { if (!played.current) { if (auto.current++ < 2) setRetry((r) => r + 1); else fail(tn("errors.stream.stuck")) } }, live ? 15000 : 25000)
    return () => {
      clearTimeout(t)
      clearTimeout(wd)
      timers.current.forEach(clearTimeout); timers.current = []
      stop()
      v.pause()
      v.removeAttribute("src") // release the decoder and any buffered/blob source
      v.load()
    }
  }, [url, live, retry, viaHls]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Back online / app brought to the front: a dead or still-loading stream restarts (after a pause so the provider drops the old connection) */
  useEffect(() => {
    const wake = () => {
      const v = vref.current
      if (document.visibilityState === "hidden" || !(err || !played.current || (v && !v.paused && v.readyState < 3))) return
      auto.current = 0
      again(1500)
    }
    window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake)
    return () => { window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake) }
  }, [err]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (err) meas.current.errTotal++ }, [err])

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
      setStats({ q: rate({ bufAhead: buf, stalls: stalls.current.length, bw: bwOk, bitrate: lv?.bitrate }), bw: bwOk, bitrate: lv?.bitrate, height: lv?.height || v.videoHeight || undefined, buf, dropped, stalls: stalls.current.length, audio: audioLabel(aud.current) })
    }, 2000)
    return () => clearInterval(t)
  }, [vref])

  /* <video> event handlers owned by the engine (Player adds the rest) */
  const handlers = {
    onWaiting: () => { setBuf(true); if (played.current) { stalls.current.push(Date.now()); meas.current.stallTotal++ } },
    onPlaying: () => { auto.current = 0; setBuf(false); setStarted(true); setPaused(false); played.current = true; meas.current.startupMs ??= Date.now() - meas.current.attachAt },
    onPause: () => setPaused(true),
    onError: () => fallback ? fallback() : (!live && !hls.current && viaHls !== url && Hls.isSupported() ? setViaHls(url) : fail(vref.current?.error?.code === 4 ? tn("errors.video.format") : vref.current?.error?.code === 3 ? tn("errors.video.corrupt") : tn("errors.video.cannotPlay"))),
  }

  return { hls, mp, err, buf, started, paused, audio, subs, setSubs, stats, statsRef, meas, handlers, retry: () => { auto.current = 0; setRetry((r) => r + 1) } }
}
