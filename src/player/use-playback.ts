import { useEffect, useRef, useState, type RefObject } from "react"
import type Hls from "hls.js"
import { loadedEngines, loadHls, loadMpegts } from "@/lib/engines"
import { useCatalog } from "@/lib/catalog"
import { useApp } from "@/lib/store"
import { connInfo } from "@/lib/xtream"
import { corsHint, statusMsg } from "@/lib/net"
import { rate } from "@/lib/quality"
import { t as tn } from "@/lib/i18n"
import type { Item, Source } from "@/lib/types"
import { attach, release, type Stream, type Track } from "./engine"
import { engineToLoad, MAX_AUTO, mpegtsAction, nativeAction, watchdogMs, ZAP_DELAY, type Fail } from "./engine-pure"
import { audioLabel, type Stats } from "./stats"

export type { Track }
const MSG: Record<string, string> = { decode: "errors.stream.decode", unavailable: "errors.stream.unavailable", offline: "errors.stream.offline", stuck: "errors.stream.stuck", format: "errors.video.format", corrupt: "errors.video.corrupt", cannot: "errors.video.cannotPlay" }
const LOAD = { hls: loadHls, mpegts: loadMpegts }

/* hls.js plays most streams: fetch it while the app is idle once the catalog is on screen, so the first play does not wait for it */
if (typeof window !== "undefined") {
  const warm = () => window.setTimeout(() => void loadHls().catch(() => {}), 4000) // a failure is retried by the first play that needs it
  if (useCatalog.getState().status === "ready") warm()
  else { const off = useCatalog.subscribe((c) => { if (c.status === "ready") { off(); warm() } }) }
}
const say = (f: Fail) => (f.why === "http" ? statusMsg(f.code) : f.why === "cors" ? corsHint() : f.why === "blocked" ? tn("errors.http.blocked", { host: f.host }) : tn(MSG[f.why]))

/**
 * Playback of one item in `vref`: attaches the engine for the current URL and keeps it alive (watchdog, retries, back online / app in front),
 * reports buffering / errors / tracks, and samples connection quality every 2 s. Used by the player and by every Multiview tile.
 */
export function usePlayback(o: { vref: RefObject<HTMLVideoElement | null>; item: Item; live: boolean; raw: string; url: string; direct: boolean; toProxy: () => void; src?: Source | null; fallback?: () => void }) {
  const { vref, item, live, raw, url, direct, src } = o
  const proxy = useApp((s) => s.settings.proxy)
  const [eng, setEng] = useState(loadedEngines) // hls.js / mpegts.js each arrive on the first playback that needs them (spinner meanwhile)
  const [err, setErr] = useState("")
  const [buf, setBuf] = useState(true)
  const [started, setStarted] = useState(false) // first frame shown: loading screen vs rebuffering ring
  const [paused, setPaused] = useState(false)
  const [audio, setAudio] = useState<Track[]>([])
  const [subs, setSubs] = useState<Track[]>([])
  const statsRef = useRef<Stats | null>(null) // a ref, not state: a 2 s re-render of the whole player for numbers only the Info tab shows (it reads them itself)
  const [retryN, setRetryN] = useState(0)
  const [viaHls, setViaHls] = useState("") // URL whose native playback failed: retried through hls.js
  const stream = useRef<Stream | null>(null)
  const hls = useRef<Hls | null>(null)
  const auto = useRef(0) // automatic restarts since the last good playback (watchdog, mpegts); capped so a dead stream reaches the error screen
  const gen = useRef(0)
  const timers = useRef<number[]>([])
  const played = useRef(false)
  const stalls = useRef<number[]>([]) // rebuffer times in the last minute
  const aud = useRef<{ codec?: string; ch?: number }>({})
  const meas = useRef({ stallTotal: 0, errTotal: 0, attachAt: 0, startupMs: undefined as number | undefined }) // read by the watch history
  const cb = useRef(o) // latest callbacks for the engine events
  cb.current = o

  useEffect(() => { setAudio([]); setSubs([]) }, [item.id])
  useEffect(() => { auto.current = 0 }, [url, live])
  const need = engineToLoad({ raw, live, viaHls: viaHls === url }, { hls: eng.Hls?.isSupported(), mpegts: eng.mpegts?.isSupported() })
  useEffect(() => { if (need) void LOAD[need]().then(() => setEng(loadedEngines()), () => setErr(tn("errors.stream.unavailable"))) }, [need, retryN]) // Retry also re-tries a script that failed to load
  useEffect(() => { if (err) meas.current.errTotal++ }, [err])

  /** Final error. A refused stream on an Xtream account at its connection limit gets the real reason. */
  const fail = (f: Fail) => {
    const g = gen.current, msg = say(f)
    if (!f.account || src?.type !== "xtream") return setErr(msg)
    void connInfo(src, proxy).then((c) => { if (g === gen.current) setErr(c && c.act >= c.max ? tn("errors.maxConn", { act: c.act, max: c.max }) : msg) })
  }
  const later = (ms: number) => { timers.current.push(window.setTimeout(() => setRetryN((n) => n + 1), ms)) }

  const first = useRef(true)
  useEffect(() => {
    if (need) return
    const v = vref.current!
    const g = ++gen.current
    setErr(""); setBuf(true); setStarted(false); statsRef.current = null
    aud.current = {}; stalls.current = []; played.current = false
    meas.current.attachAt = Date.now(); meas.current.startupMs = undefined
    const live_ = () => g === gen.current
    const start = () => {
      const s = attach(v, eng, { url, raw, live, direct, viaHls: viaHls === url }, {
        tracks: (t) => { if (!live_()) return; if (t.audio) setAudio(t.audio); if (t.subs) setSubs(t.subs) },
        codec: (c) => { aud.current = c },
        fatal: (f) => live_() && fail(f),
        proxy: () => live_() && cb.current.toProxy(),
        mpegtsError: (code) => {
          if (!live_()) return
          const a = mpegtsAction(code, auto.current++)
          if (a.do === "retry") later(a.ms)
          else fail(a.fail)
        },
      })
      stream.current = s
      hls.current = s.hls
    }
    const wasFirst = first.current
    first.current = false
    const t = live && !wasFirst ? window.setTimeout(start, ZAP_DELAY) : (start(), 0)
    // a provider that accepts the connection but sends nothing raises no error: restart (twice), then give up
    const wd = window.setTimeout(() => { if (!played.current) { if (auto.current++ < MAX_AUTO) setRetryN((n) => n + 1); else fail({ why: "stuck", account: true }) } }, watchdogMs(live))
    return () => {
      clearTimeout(t); clearTimeout(wd)
      timers.current.forEach(clearTimeout); timers.current = []
      stream.current?.stop(); stream.current = null; hls.current = null
      release(v)
    }
  }, [url, live, retryN, viaHls, eng, need]) // eslint-disable-line react-hooks/exhaustive-deps

  /* back online / app back in front: a dead or still-loading stream restarts after a pause (the provider drops the old connection meanwhile) */
  useEffect(() => {
    const wake = () => {
      const v = vref.current
      if (document.visibilityState === "hidden" || !(err || !played.current || (v && !v.paused && v.readyState < 3))) return
      auto.current = 0
      later(1500)
    }
    window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake)
    return () => { window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake) }
  }, [err]) // eslint-disable-line react-hooks/exhaustive-deps

  /* connection quality, every 2 s while playing */
  useEffect(() => {
    const id = setInterval(() => {
      const v = vref.current
      if (!v || v.paused || v.readyState < 2) return
      const now = Date.now()
      stalls.current = stalls.current.filter((x) => now - x < 60000)
      let ahead = 0
      for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime && v.buffered.end(i) >= v.currentTime) ahead = v.buffered.end(i) - v.currentTime
      const h = hls.current
      const lv = h && h.currentLevel >= 0 ? h.levels[h.currentLevel] : undefined
      const kbs = (stream.current?.mp?.statisticsInfo as { speed?: number } | undefined)?.speed // KB/s
      const bw0 = h ? h.bandwidthEstimate : kbs ? kbs * 8 * 1024 : undefined
      const bw = bw0 && isFinite(bw0) ? bw0 : undefined
      const pq = v.getVideoPlaybackQuality?.()
      const dropped = pq && pq.totalVideoFrames > 60 ? (pq.droppedVideoFrames / pq.totalVideoFrames) * 100 : 0
      statsRef.current = ({ q: rate({ bufAhead: ahead, stalls: stalls.current.length, bw, bitrate: lv?.bitrate }), bw, bitrate: lv?.bitrate, height: lv?.height || v.videoHeight || undefined, buf: ahead, dropped, stalls: stalls.current.length, audio: audioLabel(aud.current) })
    }, 2000)
    return () => clearInterval(id)
  }, [vref])

  /** <video> events owned by playback (the player adds its own). */
  const handlers = {
    onWaiting: () => { setBuf(true); if (played.current) { stalls.current.push(Date.now()); meas.current.stallTotal++ } },
    onPlaying: () => { auto.current = 0; played.current = true; setBuf(false); setStarted(true); setPaused(false); meas.current.startupMs ??= Date.now() - meas.current.attachAt },
    onPause: () => setPaused(true),
    onError: () => {
      const g = gen.current, code = vref.current?.error?.code, usedHls = !!hls.current
      const decide = (hlsOk: boolean) => {
        if (g !== gen.current) return
        const a = nativeAction({ fallback: !!cb.current.fallback, live, usedHls, triedHls: viaHls === url, hlsOk, code })
        if (a.do === "fallback") cb.current.fallback!()
        else if (a.do === "hls") setViaHls(url)
        else fail(a.fail)
      }
      // a native VOD may never have needed hls.js: load it now to know whether the hls.js retry is possible
      if (eng.Hls || cb.current.fallback || live || usedHls || viaHls === url) decide(!!eng.Hls?.isSupported())
      else void loadHls().then((H) => decide(H.isSupported()), () => decide(false))
    },
  }

  return { hls, err, buf, started, paused, audio, subs, statsRef, meas, handlers, retry: () => { auto.current = 0; setRetryN((n) => n + 1) } }
}
