// Device, playback, network and service checks.
import Hls from "hls.js"
import mpegts from "mpegts.js"
import pkg from "../../../package.json"
import { fmt, t } from "@/lib/i18n"
import { getOverride } from "@/lib/device"
import { px } from "@/lib/net"
import { useApp } from "@/lib/store"
import { probe, say } from "./probe"
import { res, type Check, type Env, type GroupId } from "./types"

const mk = (group: GroupId, id: string, title: string, run: Check["run"], sub?: string): Check => ({ id: `${group}.${id}`, group, title, run, sub })
export const hasProxy = () => px("http://a.test/", useApp.getState().settings.proxy) !== "http://a.test/"
const mb = (n: number) => fmt.decimal(n / 1048576, 1)

/* ---------- 1. device ---------- */
export function deviceChecks(): Check[] {
  const h = document.documentElement
  const s = () => useApp.getState().settings
  const d = (id: string, run: Check["run"]) => mk("device", id, t(`diag.dev.${id}`), run)
  return [
    d("mode", async () => res("ok", `${h.dataset.mode ?? "?"}${getOverride() !== "auto" ? ` (${t("diag.dev.override")})` : ""}`)),
    d("layout", async () => res("ok", s().layout)),
    d("lang", async () => res("ok", `${h.lang || "?"} / ${h.dir || "ltr"} (${t("diag.dev.setting")}: ${s().language})`)),
    d("theme", async () => res("ok", `${s().theme} (${h.classList.contains("dark") ? t("diag.dev.dark") : t("diag.dev.light")})`)),
    d("motion", async () => res("ok", `${s().motion}${h.dataset.motion && h.dataset.motion !== s().motion ? ` -> ${h.dataset.motion}` : ""}`)),
    d("ua", async () => {
      const u = navigator.userAgent
      return res("ok", (u.match(/(Web0S|webOS|SmartTV|Android|iPhone|iPad|Windows|Macintosh|Linux)[^;)]*/i)?.[0] ?? "?") + " / " + (u.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0] ?? "?"))
    }),
    d("viewport", async () => res("ok", `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`)),
    d("secure", async () => {
      const sec = window.isSecureContext, sub = typeof crypto !== "undefined" && !!crypto.subtle
      return sec && sub ? res("ok", t("diag.dev.secure.ok")) : res("warn", t("diag.dev.secure.no", { secure: String(sec), subtle: String(sub) }), t("diag.dev.secure.hint"))
    }),
    d("sw", async () => {
      if (!("serviceWorker" in navigator)) return res("skip", t("diag.dev.sw.none"))
      const r = await navigator.serviceWorker.getRegistration()
      return r?.active ? res("ok", `${t("diag.dev.sw.active")}${navigator.serviceWorker.controller ? "" : ` (${t("diag.dev.sw.notControlling")})`}`) : res("skip", t("diag.dev.sw.notReg"))
    }),
    d("online", async () => (navigator.onLine ? res("ok", t("diag.dev.online.ok")) : res("fail", t("diag.dev.offline"), t("diag.dev.offline.hint")))),
    d("storage", async () => {
      const e = await navigator.storage?.estimate?.()
      if (!e || e.usage == null) return res("skip", t("diag.na"))
      const full = e.quota ? e.usage / e.quota : 0
      return res(full > 0.9 ? "warn" : "ok", e.quota ? t("diag.dev.storage.of", { used: mb(e.usage), total: mb(e.quota) }) : `${mb(e.usage)} MB`, full > 0.9 ? t("diag.dev.storage.hint") : undefined)
    }),
    d("version", async () => res("ok", `Leen TV ${pkg.version}`)),
  ]
}

/* ---------- 2. playback capabilities ---------- */
export function playbackChecks(): Check[] {
  const p = (id: string, run: Check["run"]) => mk("playback", id, t(`diag.pb.${id}`), run)
  const feat = (id: string, ok: boolean, hint: string, soft = true) => p(id, async () => (ok ? res("ok", t("diag.supported")) : res(soft ? "warn" : "fail", t("diag.unsupported"), t(hint))))
  const v = document.createElement("video")
  const can = (id: string, type: string, need: boolean, hint = "diag.pb.codec.hint") =>
    p(id, async () => {
      const r = v.canPlayType(type)
      return r ? res("ok", t(r === "probably" ? "diag.pb.yes" : "diag.pb.maybe")) : res(need ? "fail" : "warn", t("diag.pb.no"), t(hint))
    })
  const doc = document as Document & { webkitFullscreenEnabled?: boolean }
  return [
    feat("mse", !!(window.MediaSource || (window as unknown as { ManagedMediaSource?: unknown }).ManagedMediaSource), "diag.pb.mse.hint", false),
    feat("hlsjs", Hls.isSupported(), "diag.pb.mse.hint"),
    feat("mpegts", mpegts.isSupported(), "diag.pb.mse.hint"),
    can("h264", 'video/mp4; codecs="avc1.640028"', true),
    can("hevc", 'video/mp4; codecs="hvc1.1.6.L150.B0"', false),
    can("vp9", 'video/mp4; codecs="vp09.00.10.08"', false),
    can("av1", 'video/mp4; codecs="av01.0.08M.08"', false),
    can("aac", 'audio/mp4; codecs="mp4a.40.2"', true),
    can("ac3", 'audio/mp4; codecs="ac-3"', false),
    can("eac3", 'audio/mp4; codecs="ec-3"', false),
    can("mp4", "video/mp4", true),
    can("mkv", "video/x-matroska", false, "diag.pb.mkv.hint"),
    can("hlsNative", "application/vnd.apple.mpegurl", false, "diag.pb.hlsNative.hint"),
    feat("decomp", "DecompressionStream" in window, "diag.pb.decomp.hint"),
    feat("pip", !!document.pictureInPictureEnabled, "diag.pb.optional"),
    feat("fullscreen", !!(document.fullscreenEnabled || doc.webkitFullscreenEnabled), "diag.pb.optional"),
    feat("wake", "wakeLock" in navigator, "diag.pb.wake.hint"),
    feat("crypto", typeof crypto !== "undefined" && !!crypto.subtle, "diag.dev.secure.hint"),
  ]
}

/* ---------- 3. network ---------- */
export function networkChecks(): Check[] {
  const n = (id: string, run: Check["run"]) => mk("network", id, t(`diag.net.${id}`), run)
  const s = () => useApp.getState().settings
  return [
    n("internet", async () => {
      const t0 = performance.now()
      const c = new AbortController()
      const id = setTimeout(() => c.abort(), 7000)
      try {
        await fetch("https://www.gstatic.com/generate_204", { mode: "no-cors", signal: c.signal, cache: "no-store" })
        const ms = Math.round(performance.now() - t0)
        return res("ok", t("diag.net.internet.ok"), undefined, ms)
      } catch {
        return res("fail", t("diag.net.internet.fail"), t("diag.net.internet.hint"))
      } finally { clearTimeout(id) }
    }),
    n("builtin", async () => {
      if (!/^https?:$/.test(location.protocol)) return res("skip", t("diag.net.builtin.file"))
      const t0 = performance.now()
      try {
        const r = await fetch("/p", { cache: "no-store" })
        const ms = Math.round(performance.now() - t0)
        if (r.status === 400 && (await r.text()).includes("bad url")) return res("ok", t("diag.net.builtin.ok"), undefined, ms)
        return res(s().proxy.trim() ? "skip" : "warn", t("diag.net.builtin.missing", { status: r.status }), t("diag.net.builtin.hint"), ms)
      } catch {
        return res(s().proxy.trim() ? "skip" : "warn", t("diag.net.builtin.down"), t("diag.net.builtin.hint"))
      }
    }),
    n("explicit", async () => {
      const p = s().proxy.trim()
      if (!p) return res("skip", t("diag.net.explicit.none"))
      if (!/^https?:\/\//.test(p)) return res("fail", t("diag.net.explicit.bad"), t("diag.net.explicit.hint"))
      const r = await probe(px("https://www.gstatic.com/generate_204", p), { read: 64 })
      return r.kind === "ok" ? res("ok", t("diag.net.explicit.ok", { streams: String(s().proxyStreams) }), undefined, Math.round(r.ms)) : res("fail", say(r), t("diag.net.explicit.hint"))
    }),
    ...useApp.getState().sources.filter((x) => x.enabled !== false && (x.url || x.server || x.epgUrl)).map((src) =>
      mk("network", `mixed.${src.id}`, t("diag.net.mixed"), async () => {
        const urls = [src.url, src.server, src.epgUrl, ...(src.conns ?? []).map((c) => c.uri)].filter(Boolean) as string[]
        const bad = urls.filter((u) => /^http:/i.test(u))
        if (location.protocol !== "https:") return res("ok", t("diag.net.mixed.page", { proto: location.protocol }))
        if (!bad.length) return res("ok", t("diag.net.mixed.https"))
        return hasProxy() ? res("warn", t("diag.net.mixed.proxied", { n: bad.length }), t("diag.net.mixed.proxiedHint")) : res("fail", t("diag.net.mixed.blocked", { n: bad.length }), t("diag.net.mixed.blockedHint"))
      }, src.name)),
  ]
}

/* ---------- 6. services ---------- */
export function serviceChecks(env: Env): Check[] {
  const meta = (id: string) => useApp.getState().settings.meta?.find((c) => c.id === id)
  const sv = (id: string, run: Check["run"]) => mk("services", id, t(`diag.svc.${id}`), run)
  return [
    sv("tmdb", async () => {
      const k = meta("tmdb")?.key?.trim()
      if (!k) return res("skip", t("diag.svc.nokey"))
      const bearer = k.length > 40
      const r = await probe(`https://api.themoviedb.org/3/configuration${bearer ? "" : `?api_key=${encodeURIComponent(k)}`}`, { text: true, read: 8192, init: bearer ? { headers: { Authorization: `Bearer ${k}` } } : undefined })
      if (r.kind === "ok") return res("ok", t("diag.svc.keyOk"), undefined, Math.round(r.ms))
      return res("fail", r.status === 401 ? t("diag.svc.keyBad") : say(r), r.status === 401 ? t("diag.svc.keyBad.hint") : t("diag.svc.net.hint"))
    }),
    sv("omdb", async () => {
      const k = meta("omdb")?.key?.trim()
      if (!k) return res("skip", t("diag.svc.nokey"))
      const r = await probe(`https://www.omdbapi.com/?apikey=${encodeURIComponent(k)}&i=tt0111161`, { text: true, read: 16384 })
      if (r.kind !== "ok") return res("fail", r.status === 401 ? t("diag.svc.keyBad") : say(r), r.status === 401 ? t("diag.svc.keyBad.hint") : t("diag.svc.net.hint"))
      let j: { Response?: string; Error?: string } = {}
      try { j = JSON.parse(r.text ?? "") } catch { /* not json */ }
      return j.Response === "True" ? res("ok", t("diag.svc.keyOk"), undefined, Math.round(r.ms)) : res("fail", j.Error ?? t("diag.svc.keyBad"), t("diag.svc.keyBad.hint"))
    }),
    sv("sbReach", async () => {
      const y = env.sync()
      if (!y.configured) return res("skip", t("diag.svc.sb.off"), t("diag.svc.sb.offHint"))
      const r = await probe(`${y.config.url}/auth/v1/health`, { text: true, read: 4096, init: { headers: { apikey: y.config.anonKey } } })
      let host = y.config.url
      try { host = new URL(y.config.url).host } catch { /* keep raw */ }
      return r.kind === "ok" ? res("ok", t("diag.svc.sb.up", { host }), undefined, Math.round(r.ms)) : res("fail", `${host}: ${say(r)}`, t("diag.svc.sb.hint"))
    }),
    sv("sbSession", async () => {
      const y = env.sync()
      if (!y.configured) return res("skip", t("diag.svc.sb.off"))
      return y.session ? res("ok", t("diag.svc.sb.signedIn")) : res("warn", t("diag.svc.sb.signedOut"), t("diag.svc.sb.signInHint"))
    }),
    sv("sbLast", async () => {
      const y = env.sync()
      if (!y.configured || !y.session) return res("skip", t("diag.svc.sb.off"))
      const st = y.status
      if (st.state === "error") return res("fail", st.error ?? t("diag.svc.sb.err"), t("diag.svc.sb.errHint"))
      if (!st.lastSyncAt) return res("warn", t("diag.svc.sb.never"), t("diag.svc.sb.neverHint"))
      return res("ok", t("diag.svc.sb.last", { when: `${fmt.date(st.lastSyncAt, { dateStyle: "medium", timeStyle: "short" })}`, state: st.state }))
    }),
    sv("sbWould", async () => {
      const y = env.sync()
      const why: string[] = []
      if (!y.configured) why.push(t("diag.svc.why.config"))
      else if (!y.session) why.push(t("diag.svc.why.signin"))
      if (y.status.needPass) why.push(t("diag.svc.why.pass"))
      if (!navigator.onLine) why.push(t("diag.svc.why.offline"))
      if (y.configured && !y.canEncrypt) why.push(t("diag.svc.why.crypto"))
      return why.length ? res(y.configured ? "warn" : "skip", `${t("diag.no")}: ${why.join(", ")}`) : res("ok", t("diag.yes"))
    }),
  ]
}
