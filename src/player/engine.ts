import type Hls from "hls.js"
import type mpegts from "mpegts.js"
import type { Engines } from "@/lib/engines"
import { t as tn } from "@/lib/i18n"
import { hlsAction, pickEngine, type EngineKind, type Fail } from "./engine-pure"
import { logError } from "@/lib/errlog"

/** play() refused: autoplay policy (NotAllowedError, the viewer presses Play) or a newer load (AbortError, nothing wrong). Only the first is worth a line. */
export const playRefused = (s: { name?: string; raw?: string }) => (e: unknown) => {
  if (e instanceof DOMException && e.name === "AbortError") return
  logError(e, { kind: "playback", level: "warn", ctx: s.name, data: { step: "play()", url: s.raw } })
}

export type Track = { id: number; label: string; detail?: string; flags?: string[] }
/** One stream to play. `raw` = the provider URL (decides the engine), `url` = what is fetched (raw, or raw through the proxy). */
export type Spec = { url: string; raw: string; live: boolean; direct: boolean; viaHls: boolean; name?: string } // name: the title, for the error log
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
export function attach(v: HTMLVideoElement, eng: Partial<Engines>, s: Spec, on: Events): Stream {
  const { Hls, mpegts } = eng // only the scripts this stream needs are loaded (engineToLoad); a missing one counts as unsupported
  const kind = pickEngine({ raw: s.raw, live: s.live, viaHls: s.viaHls, hls: !!Hls?.isSupported(), mpegts: !!mpegts?.isSupported() })

  if (kind === "hls" && Hls) {
    // bounded buffers: the back buffer defaults to Infinity, which an old TV runs out of memory on during a long live session
    const h = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60, backBufferLength: s.live ? 10 : 30, maxBufferSize: 30 * 1000 * 1000, enableWorker: true })
    let tries = 0 // per outage: a buffered fragment resets it
    h.loadSource(s.url)
    h.attachMedia(v)
    h.on(Hls.Events.MANIFEST_PARSED, () => void v.play().catch(playRefused(s)))
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
      // every hls.js error goes to the log (non-fatal ones are recovered by hls.js itself, so they are warnings); the fatal one's outcome is the player's error
      const fact = { engine: "hls.js", type: d.type, details: d.details, fatal: d.fatal, status: d.response?.code, url: (d as { url?: string }).url ?? d.frag?.url ?? d.context?.url, reason: d.reason ?? d.error?.message }
      if (!d.fatal) return logError(`hls.js: ${d.details}`, { kind: "playback", level: "warn", ctx: s.name, data: fact })
      const type = d.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : d.type === Hls.ErrorTypes.MEDIA_ERROR ? "media" : "other"
      const a = hlsAction({ type, code: d.response?.code, blocked: blockedBy(d.networkDetails) || undefined }, { tries, direct: s.direct, parsed: !!h.levels?.length })
      if (a.do !== "fail") logError(`hls.js fatal ${d.details}: ${a.do}`, { kind: "playback", level: "warn", ctx: s.name, data: { ...fact, attempt: tries + 1 } })
      if (a.do === "proxy") on.proxy() // startLoad would not refetch the manifest: the hook re-attaches with the proxied URL
      else if (a.do === "restart") { tries++; h.startLoad() }
      else if (a.do === "recover") { tries++; h.recoverMediaError() }
      else on.fatal(a.fail)
    })
    return { kind, hls: h, mp: null, stop: () => { h.stopLoad(); h.detachMedia(); h.destroy() } }
  }

  if (kind === "mpegts" && mpegts) {
    const p = mpegts.createPlayer({ type: "mpegts", isLive: true, url: s.url }, {
      enableWorker: true, liveBufferLatencyChasing: true,
      autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 30, autoCleanupMinBackwardDuration: 15, // drop played media instead of growing the SourceBuffer
    })
    p.attachMediaElement(v)
    p.load()
    p.on(mpegts.Events.MEDIA_INFO, (mi: { audioCodec?: string; audioChannelCount?: number }) => { if (mi.audioCodec) on.codec({ codec: mi.audioCodec, ch: mi.audioChannelCount }) })
    p.on(mpegts.Events.ERROR, (type: string, detail: string, info: { code?: number; msg?: string }) => { logError(`mpegts.js: ${type} ${detail}`, { kind: "playback", level: "warn", ctx: s.name, data: { engine: "mpegts.js", type, detail, code: info?.code, reason: info?.msg, url: s.raw } }); on.mpegtsError(info?.code) })
    void Promise.resolve(p.play()).catch(playRefused(s))
    return { kind, hls: null, mp: p, stop: () => { p.pause(); p.unload(); p.detachMediaElement(); p.destroy() } } // unload() aborts the open live connection
  }

  v.src = s.url
  void v.play().catch(playRefused(s))
  return { kind, hls: null, mp: null, stop: () => {} }
}

/** Release the decoder and any buffered / blob source after a stream stopped. */
export function release(v: HTMLVideoElement) {
  v.pause()
  v.removeAttribute("src")
  v.load()
}
