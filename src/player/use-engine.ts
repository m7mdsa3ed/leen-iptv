import { useEffect, useRef, useState, type RefObject } from "react"
import Hls from "hls.js"
import mpegts from "mpegts.js"
import { corsHint, statusMsg } from "@/lib/net"
import { rate } from "@/lib/quality"
import { t as tn } from "@/lib/i18n"
import type { Item } from "@/lib/types"
import { audioLabel, type Stats } from "./stats"

export type Track = { id: number; label: string }

/** hls.js / mpegts.js / native <video> for one item, plus the connection-quality sampler and the video event handlers that feed it.
    Teardown is strict: the old stream must be fully closed (requests aborted, decoder released) before the next one opens, because many
    providers allow only 1-2 connections and a leftover one makes the new channel fail. */
export function useEngine(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; raw: string; url: string; direct: boolean; setProxied: (u: string) => void }) {
  const { vref, item, live, raw, url, direct, setProxied } = o
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
  const stalls = useRef<number[]>([]) // timestamps of rebuffer events in the last minute
  const played = useRef(false)
  // watch-history measurements (read by the tracker)
  const meas = useRef({ stallTotal: 0, errTotal: 0, attachAt: 0, startupMs: undefined as number | undefined })
  const statsRef = useRef(stats)
  const aud = useRef<{ codec?: string; ch?: number }>({}) // audio as demuxed (hls.js / mpegts.js); unknown for native <video>
  statsRef.current = stats

  useEffect(() => { setAudio([]); setSubs([]) }, [item.id])

  const firstAttach = useRef(true)
  useEffect(() => {
    const v = vref.current!
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
        h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(() => {}))
        h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudio(h.audioTracks.map((x, i) => ({ id: i, label: x.name || x.lang || tn("player.audioTrack", { n: i + 1 }) }))))
        h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubs(h.subtitleTracks.map((x, i) => ({ id: i, label: x.name || x.lang || tn("player.subtitleTrack", { n: i + 1 }) }))))
        h.on(Hls.Events.ERROR, (_e, d) => {
          if (!d.fatal) return
          const code = d.response?.code
          const http = !!code && code >= 400 // 4xx will not fix itself: no retries
          if (direct && d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && !h.levels?.length) setProxied(raw) // direct manifest failed (CORS / unreachable): retry through the proxy once (startLoad would not refetch it)
          else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !http && net++ < 3) h.startLoad()
          else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && net++ < 3) h.recoverMediaError()
          else setErr(http ? statusMsg(code) : d.type === Hls.ErrorTypes.NETWORK_ERROR ? corsHint() : d.type === Hls.ErrorTypes.MEDIA_ERROR ? tn("errors.stream.decode") : tn("errors.stream.unavailable"))
        })
        stop = () => { h.stopLoad(); h.detachMedia(); h.destroy(); hls.current = null }
      } else if (live && mpegts.isSupported()) {
        const p = mpegts.createPlayer({ type: "mpegts", isLive: true, url }, { enableWorker: true, liveBufferLatencyChasing: true })
        mp.current = p
        p.attachMediaElement(v); p.load()
        p.on(mpegts.Events.MEDIA_INFO, (mi: { audioCodec?: string; audioChannelCount?: number }) => { if (mi.audioCodec) aud.current = { codec: mi.audioCodec, ch: mi.audioChannelCount } })
        void Promise.resolve(p.play()).catch(() => {})
        p.on(mpegts.Events.ERROR, (_t, _d, info: { code?: number }) => setErr(info?.code && info.code >= 400 ? statusMsg(info.code) : tn("errors.stream.offline")))
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
  }, [url, live, retry, viaHls]) // eslint-disable-line react-hooks/exhaustive-deps

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
    onPlaying: () => { setBuf(false); setStarted(true); setPaused(false); played.current = true; meas.current.startupMs ??= Date.now() - meas.current.attachAt },
    onPause: () => setPaused(true),
    onError: () => (!live && !hls.current && viaHls !== url && Hls.isSupported() ? setViaHls(url) : setErr(vref.current?.error?.code === 4 ? tn("errors.video.format") : vref.current?.error?.code === 3 ? tn("errors.video.corrupt") : tn("errors.video.cannotPlay"))),
  }

  return { hls, mp, err, buf, started, paused, audio, subs, setSubs, stats, statsRef, meas, handlers, retry: () => setRetry((r) => r + 1) }
}
