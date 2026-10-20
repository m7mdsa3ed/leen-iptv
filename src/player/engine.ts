import type Hls from "hls.js"
import type mpegts from "mpegts.js"
import type { Engines } from "@/lib/engines"
import { t as tn } from "@/lib/i18n"
import { hlsAction, pickEngine, type EngineKind, type Fail } from "./engine-pure"

export type Track = { id: number; label: string; detail?: string; flags?: string[] }
/** One stream to play. `raw` = the provider URL (decides the engine), `url` = what is fetched (raw, or raw through the proxy). */
export type Spec = { url: string; raw: string; live: boolean; direct: boolean; viaHls: boolean }
export type Events = {
  tracks: (t: { audio?: Track[]; subs?: Track[] }) => void
  codec: (c: { codec?: string; ch?: number }) => void
  fatal: (f: Fail) => void
  proxy: () => void // the direct manifest could not be fetched: play it through the proxy
  mpegtsError: (code?: number) => void // the hook owns the retry count (it spans re-attaches)
}
export type Stream = { kind: EngineKind; hls: Hls | null; mp: mpegts.Player | null; stop: () => void }

/** Domain the proxy saw blocked by Cloudflare (x-leen-blocked, server/proxy-core.mjs); hls.js hands back an XHR or a fetch Response. */
const blockedBy = (d: XMLHttpRequest | Response | null | undefined) => { try { return (d instanceof Response ? d.headers.get("x-leen-blocked") : d?.getResponseHeader("x-leen-blocked")) ?? "" } catch { return "" } }
const flag = (on: boolean, f: string) => (on ? f : "")

/**
 * Plays one stream in `v` and returns how to stop it. Teardown is strict: the connection is closed (requests aborted, mpegts unloaded,
 * decoder released) before the next stream opens, because many providers allow only 1-2 connections and a leftover one makes the next channel fail.
 */
export function attach(v: HTMLVideoElement, eng: Engines, s: Spec, on: Events): Stream {
  const { Hls, mpegts } = eng
  const kind = pickEngine({ raw: s.raw, live: s.live, viaHls: s.viaHls, hls: Hls.isSupported(), mpegts: mpegts.isSupported() })

  if (kind === "hls") {
    const h = new Hls({ maxBufferLength: 30, enableWorker: true })
    let tries = 0 // per outage: a buffered fragment resets it
    h.loadSource(s.url)
    h.attachMedia(v)
    h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(() => {}))
    h.on(Hls.Events.FRAG_BUFFERED, () => { tries = 0 })
    h.on(Hls.Events.BUFFER_CODECS, (_e, d) => { const a = d.audio ?? d.audiovideo; if (a?.codec) on.codec({ codec: a.codec, ch: a.metadata?.channelCount }) })
    h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => on.tracks({
      audio: h.audioTracks.map((x, i) => ({ id: i, label: x.name || x.lang || tn("player.audioTrack", { n: i + 1 }), detail: [x.lang, x.audioCodec, x.channels].filter(Boolean).join(" · ") || undefined, flags: x.default ? ["default"] : [] })),
    }))
    h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => on.tracks({
      subs: h.subtitleTracks.map((x, i) => ({
        id: i, label: x.name || x.lang || tn("player.subtitleTrack", { n: i + 1 }), detail: x.lang || undefined,
        flags: [flag(!!x.default, "default"), flag(/forced/i.test(x.characteristics || ""), "forced"), flag(/hearing.?impaired|\bsd[hx]\b/i.test(x.characteristics || ""), "sdh")].filter(Boolean),
      })),
    }))
    h.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      const type = d.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : d.type === Hls.ErrorTypes.MEDIA_ERROR ? "media" : "other"
      const a = hlsAction({ type, code: d.response?.code, blocked: blockedBy(d.networkDetails) || undefined }, { tries, direct: s.direct, parsed: !!h.levels?.length })
      if (a.do === "proxy") on.proxy() // startLoad would not refetch the manifest: the hook re-attaches with the proxied URL
      else if (a.do === "restart") { tries++; h.startLoad() }
      else if (a.do === "recover") { tries++; h.recoverMediaError() }
      else on.fatal(a.fail)
    })
    return { kind, hls: h, mp: null, stop: () => { h.stopLoad(); h.detachMedia(); h.destroy() } }
  }

  if (kind === "mpegts") {
    const p = mpegts.createPlayer({ type: "mpegts", isLive: true, url: s.url }, { enableWorker: true, liveBufferLatencyChasing: true })
    p.attachMediaElement(v)
    p.load()
    p.on(mpegts.Events.MEDIA_INFO, (mi: { audioCodec?: string; audioChannelCount?: number }) => { if (mi.audioCodec) on.codec({ codec: mi.audioCodec, ch: mi.audioChannelCount }) })
    p.on(mpegts.Events.ERROR, (_t, _d, info: { code?: number }) => on.mpegtsError(info?.code))
    void Promise.resolve(p.play()).catch(() => {})
    return { kind, hls: null, mp: p, stop: () => { p.pause(); p.unload(); p.detachMediaElement(); p.destroy() } } // unload() aborts the open live connection
  }

  v.src = s.url
  void v.play().catch(() => {})
  return { kind, hls: null, mp: null, stop: () => {} }
}

/** Release the decoder and any buffered / blob source after a stream stopped. */
export function release(v: HTMLVideoElement) {
  v.pause()
  v.removeAttribute("src")
  v.load()
}
