import { isTv } from "./device"

/* Google Cast sender with the Default Media Receiver. Chrome on desktop / Android over https or localhost only (the TV is a receiver, not a sender).
   The Chromecast fetches the stream itself, so the URL must be reachable from the cast device. Untested against real hardware. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
let sdk: Promise<boolean> | null = null

export const castSupported = () => !isTv && window.isSecureContext && /Chrome\//.test(navigator.userAgent)

const load = () => (sdk ??= new Promise<boolean>((res) => {
  ;(window as any).__onGCastApiAvailable = (ok: boolean) => res(ok)
  const s = document.createElement("script")
  s.src = SDK
  s.onerror = () => res(false)
  document.head.appendChild(s)
  setTimeout(() => res(false), 10000)
}).then((ok) => { if (!ok) sdk = null; return ok }))

const mime = (u: string) => (/\.m3u8(\?|$)|[?&]output=m3u8/i.test(u) ? "application/x-mpegURL" : /\.ts(\?|$)/i.test(u) ? "video/mp2t" : /\.mkv(\?|$)/i.test(u) ? "video/x-matroska" : "video/mp4")
/** A proxied URL on localhost / a Tailscale address means nothing to the Chromecast; the provider's own URL is the better bet then. */
const pickUrl = (url: string, raw: string) => {
  const abs = new URL(url, location.href)
  return abs.href !== raw && /^(localhost|127\.|\[::1\]|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(abs.hostname) ? raw : abs.href
}

/** Opens the device picker, then loads the stream. Resolves with the device name; rejects with Error("cancel" | "unavailable" | the Cast error code). */
export async function castStart(o: { url: string; raw: string; title: string; image?: string; live: boolean; at: number }): Promise<string> {
  if (!(await load())) throw new Error("unavailable")
  const w = window as any, ctx = w.cast.framework.CastContext.getInstance(), m = w.chrome.cast.media
  ctx.setOptions({ receiverApplicationId: m.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED })
  const bad = await ctx.requestSession()
  if (bad) throw new Error(String(bad))
  const ses = ctx.getCurrentSession(), u = pickUrl(o.url, o.raw)
  const mi = new m.MediaInfo(u, mime(u))
  mi.streamType = o.live ? m.StreamType.LIVE : m.StreamType.BUFFERED
  mi.metadata = new m.GenericMediaMetadata()
  mi.metadata.title = o.title
  if (o.image && /^https?:/.test(o.image)) mi.metadata.images = [new w.chrome.cast.Image(o.image)]
  const req = new m.LoadRequest(mi)
  req.autoplay = true
  if (!o.live && o.at > 5) req.currentTime = o.at
  const err = await ses.loadMedia(req)
  if (err) throw new Error(String(err))
  return String(ses.getCastDevice()?.friendlyName ?? "")
}

export const castStop = () => { try { (window as any).cast?.framework?.CastContext.getInstance().endCurrentSession(true) } catch { /* no session */ } }
