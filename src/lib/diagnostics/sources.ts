// Per-source checks (catalog, auth, playlists, Plex connections, Jellyfin) and stream checks.
import { logoState, useCatalog } from "@/lib/catalog"
import { loadLogoIndex } from "@/lib/logos"
import { chanKey, findRow, logoFor, type LogoFrom } from "@/lib/logos-pure"
import { fmt, t } from "@/lib/i18n"
import { jfActiveKind, jfCands, jfUrl, normServer } from "@/lib/jellyfin-pure"
import { jellyfinStopTranscode, jellyfinStreamUrl } from "@/lib/jellyfin"
import { mixed, px, pxStream } from "@/lib/net"
import { plexStopTranscode, plexStreamUrl, plexUrl } from "@/lib/plex"
import { allowedConns, connKind, plexMode, sortConns } from "@/lib/plex-pure"
import { srcOfId } from "@/lib/merge-pure"
import { useApp } from "@/lib/store"
import type { Item, Source } from "@/lib/types"
import { xtreamUrl } from "@/lib/xtream"
import { hasProxy } from "./basic"
import { httpSay, probe, say, type Probe } from "./probe"
import { res, type Check, type Env, type GroupId, type Result, type Status } from "./types"

const JSON_H = { headers: { Accept: "application/json" } }
const settings = () => useApp.getState().settings
const trim = (u: string) => u.replace(/\/+$/, "")
const mk = (group: GroupId, src: Source, id: string, title: string, run: Check["run"], extra: Partial<Check> = {}): Check => ({ id: `${group}.${src.id}.${id}`, group, title, run, sub: src.name, ...extra })
const ms = (p?: Probe) => (p ? Math.round(p.ms) : undefined)
const json = (p: Probe): Record<string, any> | null => { try { return JSON.parse(p.text ?? "") } catch { return null } } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Request the way the app does: straight from the browser, then through the proxy on a network/CORS failure (or when mixed). */
async function viaApp(url: string, init: RequestInit | undefined, read = 65536): Promise<{ r: Probe; path: "direct" | "proxy" }> {
  const o = { read, text: true, init }
  const p = px(url, settings().proxy)
  if (mixed(url)) return { r: await probe(p, o), path: "proxy" }
  const d = await probe(url, o)
  if ((d.kind === "cors" || d.kind === "net" || d.kind === "timeout") && p !== url) return { r: await probe(p, o), path: "proxy" }
  return { r: d, path: "direct" }
}

/** Which path the Player takes for a stream URL of this source (same rules as src/pages/player.tsx). */
export function streamPath(src: Source, raw: string): "direct" | "proxy" {
  const s = settings()
  if (src.type === "jellyfin" && !mixed(raw) && !s.proxyStreams) return "direct"
  const url = (src.type === "plex" || src.type === "jellyfin") && mixed(raw) ? px(raw, s.proxy) : pxStream(raw, s)
  return url !== raw ? "proxy" : "direct"
}

/** Combine the direct and proxied result of one URL into a verdict, given the path the app will really use. */
function verdict(d: Probe, p: Probe | undefined, via: "direct" | "proxy", note?: string): Result {
  const dok = d.kind === "ok", pok = p?.kind === "ok"
  const lines = [`${t("diag.v.direct")}: ${say(d)}`, `${t("diag.v.proxy")}: ${p ? say(p) : t("diag.v.noProxy")}`].join("\n")
  const out = (status: Status, head: string, hint?: string) => res(status, `${head}\n${lines}`, hint, ms(dok ? d : p))
  if (dok && (!p || pok)) return out("ok", t(p ? "diag.v.ok" : "diag.v.okDirect"))
  if (dok) return via === "proxy" ? out("fail", t("diag.v.proxyDown"), note ?? t("diag.v.proxyDown.hint")) : out("ok", t("diag.v.okDirectOnly"))
  if (pok) return via === "proxy" ? out("warn", t("diag.v.proxyOnly"), t("diag.v.proxyOnly.hint")) : out("fail", t("diag.v.directDown"), t("diag.v.directDown.hint"))
  const bad = [d, p].filter(Boolean) as Probe[]
  if (bad.every((x) => x.kind === "http" && x.status === 404)) return out("warn", t("diag.v.notOnProvider"), t("diag.v.notOnProvider.hint"))
  const h = bad.find((x) => x.kind === "http" && (x.status === 401 || x.status === 403))
  const hint = h ? t("diag.v.denied.hint") : d.kind === "mixed" ? t("diag.v.mixed.hint") : d.kind === "cors" && !p ? t("diag.v.cors.hint") : d.kind === "timeout" ? t("diag.v.timeout.hint") : t("diag.v.none.hint")
  return out("fail", t("diag.v.none"), hint)
}

/* ---------- 4. sources ---------- */
export function sourceChecks(src: Source, env: Env): Check[] {
  const out: Check[] = []
  const add = (id: string, title: string, run: Check["run"], extra?: Partial<Check>) => out.push(mk("sources", src, id, title, run, extra))

  add("catalog", t("diag.src.catalog"), async () => {
    const st = useCatalog.getState().sources[src.id]
    if (!st || st.status === "idle") return res("warn", t("diag.src.catalog.idle"), t("diag.src.catalog.idleHint"))
    if (st.status === "loading") return res("warn", st.msg || t("diag.src.catalog.loading"))
    if (st.status === "error") return res("fail", st.msg || "?", t("diag.src.catalog.errHint"))
    return res("ok", t("diag.src.catalog.ok", { count: fmt.number(st.count) }))
  })

  if (src.type !== "plex") add("logos", t("diag.src.logos"), async () => {
    const live = logoState().raw(src.id).filter((i) => i.kind === "live")
    if (!live.length) return res("skip", t("diag.src.logos.none"))
    const ix = await loadLogoIndex()
    const matches = settings().logoMatch
    const n: Record<LogoFrom, number> = { manual: 0, source: 0, db: 0, none: 0 }
    const byName: string[] = [], missing: string[] = []
    const seen = new Set<string>() // one line per channel, not per HD/FHD/backup copy
    for (const i of live) {
      const { from } = logoFor(i, ix, matches)
      n[from]++
      const k = chanKey(i.name).key
      if ((from !== "db" && from !== "none") || seen.has(k)) continue
      seen.add(k)
      if (from === "none") missing.push(i.name)
      else { const r = findRow(ix!, i.name, i.group, i.epgId); byName.push(`${i.name}  ->  ${r?.[0]} [${r?.[2]}]`) }
    }
    const list = (head: string, l: string[]) => (l.length ? `\n\n${head} (${fmt.number(l.length)}):\n${l.slice(0, 400).join("\n")}${l.length > 400 ? "\n..." : ""}` : "")
    const detail = t("diag.src.logos.ok", { have: fmt.number(live.length - n.none), total: fmt.number(live.length), source: fmt.number(n.source), db: fmt.number(n.db), manual: fmt.number(n.manual) })
      + list(t("diag.src.logos.matched"), byName) + list(t("diag.src.logos.missing"), missing)
    return res(n.none > live.length / 10 ? "warn" : "ok", detail, ix ? t("diag.src.logos.hint") : t("diag.src.logos.noIndex"))
  }, { slow: true })

  if (src.type === "xtream") {
    add("auth", t("diag.src.xtream"), async () => {
      const u = `${trim(src.server ?? "")}/player_api.php?username=${encodeURIComponent(src.user ?? "")}&password=${encodeURIComponent(src.pass ?? "")}`
      const { r, path } = await viaApp(u, undefined)
      if (r.kind !== "ok") return res("fail", say(r), r.status === 401 || r.status === 403 ? t("diag.src.xtream.denied") : t("diag.src.xtream.net"))
      const ui = json(r)?.user_info
      if (!ui) return res("fail", t("diag.src.xtream.notApi"), t("diag.src.xtream.notApiHint"))
      if (ui.auth === 0 || ui.auth === "0") return res("fail", t("diag.src.xtream.login"), t("diag.src.xtream.loginHint"))
      const exp = Number(ui.exp_date) * 1000
      const left = exp ? exp - Date.now() : Infinity
      const max = Number(ui.max_connections) || 0, act = Number(ui.active_cons) || 0
      const parts = [
        `${t("diag.src.xtream.status")}: ${ui.status ?? "?"}`,
        `${t("diag.src.xtream.expires")}: ${exp ? fmt.date(exp, { dateStyle: "medium" }) : t("diag.src.xtream.never")}`,
        `${t("diag.src.xtream.conns")}: ${act}/${max || "?"}`,
        t(path === "direct" ? "diag.src.viaDirect" : "diag.src.viaProxy"),
      ]
      const status: Status = ui.status && !/active/i.test(String(ui.status)) || left < 0 ? "fail" : left < 7 * 86400000 || (max && act >= max) ? "warn" : "ok"
      return res(status, parts.join(" · "), left < 0 || (ui.status && !/active/i.test(String(ui.status))) ? t("diag.src.xtream.expiredHint") : status === "warn" ? t("diag.src.xtream.warnHint") : undefined, ms(r))
    })
  }

  if (src.type === "m3u") {
    add("playlist", t("diag.src.m3u"), async () => {
      const { r, path } = await viaApp(src.url ?? "", undefined, 65536)
      if (r.kind !== "ok") return res("fail", say(r), t("diag.src.m3u.hint"))
      const head = (r.text ?? "").replace(/^﻿/, "")
      const has = /^\s*#EXTM3U/.test(head)
      const n = (head.match(/#EXTINF/g) ?? []).length
      return res(has ? "ok" : "fail", `HTTP ${r.status} · #EXTM3U: ${has ? t("diag.yes") : t("diag.no")} · ${t("diag.src.m3u.sample", { n })} · ${t(path === "direct" ? "diag.src.viaDirect" : "diag.src.viaProxy")}`, has ? undefined : t("diag.src.m3u.notM3u"), ms(r))
    })
  }

  if (src.type === "plex") out.push(...plexChecks(src, env))
  if (src.type === "jellyfin") out.push(...jellyfinChecks(src, env))
  return out
}

function plexChecks(src: Source, env: Env): Check[] {
  const out: Check[] = []
  const conns = src.conns?.length ? src.conns : src.server ? [{ uri: src.server }] : []
  const mode = plexMode(src.connMode)
  const cur = trim(src.server ?? "")
  const kindT = (k: string) => t(`diag.plex.kind.${k}`)
  const ident = (uri: string) => plexUrl(uri, "/identity", {}, src.token)
  const hostOf = (u: string) => { try { return new URL(u).host } catch { return u } }

  out.push(mk("sources", src, "inuse", t("diag.plex.inuse"), async () => {
    const kind = connKind(src.conns, src.server)
    const local = (src.conns ?? []).filter((c) => c.local && !c.relay)
    const lines = [t("diag.plex.using", { kind: kindT(kind), host: hostOf(cur) }), t("diag.plex.mode", { mode: t(`diag.plex.mode.${mode}`) })]
    let status: Status = "ok", hint: string | undefined
    if (!local.length) lines.push(t("diag.plex.noLocal"))
    else {
      const r = await Promise.all(local.map((c) => env.dual(ident(c.uri), JSON_H)))
      const dOk = r.some((x) => x.d.kind === "ok"), pOk = r.some((x) => x.p?.kind === "ok")
      lines.push(t(dOk ? "diag.plex.localReach" : "diag.plex.localNoReach"))
      if (!dOk && mode === "local") { status = "fail"; hint = t("diag.plex.localOnlyHint") }
      else if (dOk && !pOk && hasProxy() && streamPath(src, cur) === "proxy") { status = "warn"; lines.push(t("diag.plex.proxyNet")); hint = t("diag.plex.proxyNetHint") }
    }
    if (!/^https?:/i.test(cur)) { status = "fail"; hint = t("diag.plex.noServer") }
    lines.push(t(streamPath(src, cur) === "proxy" ? "diag.plex.streamsProxy" : "diag.plex.streamsDirect"))
    return res(status, lines.join("\n"), hint)
  }))

  const sorted = src.conns?.length ? sortConns(src.conns) : conns
  const allowed = new Set(allowedConns(src.conns ?? [], mode).map((c) => c.uri))
  sorted.forEach((c, i) => {
    const kind = src.conns?.length ? connKind(src.conns, c.uri) : "Custom"
    const inUse = trim(c.uri) === cur
    out.push(mk("sources", src, `conn${i}`, `${t("diag.plex.conn", { kind: kindT(kind) })}${inUse ? ` (${t("diag.plex.inUseTag")})` : ""} - ${hostOf(c.uri)}`, async () => {
      if (src.conns?.length && !allowed.has(c.uri)) return res("skip", t("diag.plex.blockedByMode", { mode: t(`diag.plex.mode.${mode}`) }))
      const { d, p } = await env.dual(ident(c.uri), JSON_H)
      const v = verdict(d, p, streamPath(src, c.uri), t("diag.plex.proxyNetHint"))
      return kind === "Relay" && v.status === "ok" ? { ...v, status: "warn", hint: t("diag.plex.relayHint") } : v
    }))
  })

  out.push(mk("sources", src, "token", t("diag.plex.token"), async () => {
    const { r, path } = await viaApp(plexUrl(cur, "/library/sections", {}, src.token), JSON_H, 262144)
    if (r.kind === "http" && (r.status === 401 || r.status === 403)) return res("fail", t("diag.plex.token.bad"), t("diag.plex.token.badHint"))
    if (r.kind !== "ok") return res("fail", say(r), t("diag.plex.token.net"))
    const n = (json(r)?.MediaContainer?.Directory ?? []).length
    return res("ok", `${t("diag.plex.token.ok", { n })} · ${t(path === "direct" ? "diag.src.viaDirect" : "diag.src.viaProxy")}`, undefined, ms(r))
  }))
  return out
}

function jellyfinChecks(src: Source, env: Env): Check[] {
  const base = normServer(src.server ?? "")
  const all = jfCands(src, true)
  const allowed = new Set(jfCands(src).map((c) => c.uri))
  const hostOf = (u: string) => u.replace(/^https?:\/\//, "")
  const kindT = (k: string) => t(`source.conn.kind.${k}`)
  const reach = async (c: { uri: string }) => { const { r } = await viaApp(jfUrl(c.uri, "/System/Info/Public"), JSON_H, 16384); if (r.kind !== "ok") throw r; return r }
  const out: Check[] = []
  if (all.length > 1 || src.connMode === "local" || src.connMode === "remote") out.push(mk("sources", src, "inuse", t("source.conn.diag.inuse"), async () => {
    const lines = [t("source.conn.active", { kind: kindT(jfActiveKind(src)), host: hostOf(base) }), t("source.conn.diag.mode", { mode: t(`source.conn.mode.${src.connMode ?? "auto"}`) })]
    let pick: (typeof all)[number] | undefined
    for (const c of jfCands(src)) { try { await reach(c); pick = c; break } catch { /* next */ } }
    lines.push(pick ? t("source.conn.diag.willUse", { kind: kindT(pick.kind), host: hostOf(pick.uri) }) : t("source.conn.diag.none"))
    return res(pick ? "ok" : "fail", lines.join("\n"), pick ? undefined : t("source.conn.diag.noneHint"))
  }))
  all.forEach((c, i) => out.push(mk("sources", src, `addr${i}`, `${t("source.conn.diag.addr", { kind: kindT(c.kind) })}${c.uri === base ? ` (${t("source.conn.diag.inUse")})` : ""} - ${hostOf(c.uri)}`, async () => {
    if (!allowed.has(c.uri)) return res("skip", t("source.conn.diag.blocked", { mode: t(`source.conn.mode.${src.connMode ?? "auto"}`) }))
    const { d, p } = await env.dual(jfUrl(c.uri, "/System/Info/Public"), JSON_H)
    const v = verdict(d, p, streamPath(src, c.uri), t("diag.jf.proxyHint"))
    const ok = [d, p].find((x) => x?.kind === "ok")
    const j = ok ? json(ok) : null
    if (ok && !j?.Id) return res("fail", t("diag.jf.notServer"), t("diag.jf.notServerHint"))
    if (ok && src.serverId && j?.Id !== src.serverId) return res("fail", t("source.conn.diag.other"), t("source.conn.diag.otherHint"))
    if (ok && src.token && src.userId) { // same token must work on this address too
      const { r } = await viaApp(jfUrl(c.uri, `/Users/${src.userId}`, {}, src.token), JSON_H, 4096)
      if (r.kind === "http" && (r.status === 401 || r.status === 403)) return res("fail", t("source.conn.badToken", { host: hostOf(c.uri) }), t("diag.jf.auth.badHint"))
    }
    return j ? { ...v, detail: `${j.ServerName ?? "Jellyfin"} ${j.Version ?? ""}\n${v.detail}` } : v
  })))
  if (!all.length) out.push(mk("sources", src, "info", t("diag.jf.info"), async () => res("fail", t("diag.jf.notServer"), t("diag.jf.notServerHint"))))
  out.push(mk("sources", src, "auth", t("diag.jf.auth"), async () => {
    const { r } = await viaApp(jfUrl(base, `/Users/${src.userId}/Views`, {}, src.token), JSON_H, 131072)
    if (r.kind === "http" && (r.status === 401 || r.status === 403)) return res("fail", t("diag.jf.auth.bad"), t("diag.jf.auth.badHint"))
    if (r.kind !== "ok") return res("fail", say(r), t("diag.jf.auth.net"))
    return res("ok", t("diag.jf.auth.ok", { n: (json(r)?.Items ?? []).length }), undefined, ms(r))
  }))
  return out
}

/* ---------- 5. streams ---------- */
const isHlsUrl = (u: string) => /\.m3u8(\?|$)/i.test(u) || /[?&]output=m3u8/i.test(u)
const firstUri = (text: string) => text.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"))

function rawUrl(src: Source, item: Item, live: boolean): string {
  if (item.url) return item.url
  if (src.type === "plex") return plexStreamUrl(src, item)
  if (src.type === "jellyfin") return jellyfinStreamUrl(src, item)
  return xtreamUrl(src, live ? "live" : "movie", item.sid!, live ? settings().liveExt : item.ext || "mp4")
}

/** First manifest -> (variant) -> first segment. Reports manifest sanity, segment reachability, CORS and a rough bandwidth. */
async function hlsDeep(first: Probe, path: "direct" | "proxy"): Promise<{ status: Status; line: string }> {
  const hasM = /^\s*#EXTM3U/.test(first.text ?? "")
  if (!hasM) return { status: "fail", line: t("diag.hls.notM3u") }
  let text = first.text ?? "", base = first.url ?? location.href
  const variant = /#EXT-X-STREAM-INF/.test(text) ? firstUri(text.slice(text.indexOf("#EXT-X-STREAM-INF"))) : undefined
  if (variant) {
    const vu = new URL(variant, base).href
    const v = await probe(vu, { read: 1 << 20, text: true })
    if (v.kind !== "ok") return { status: "fail", line: `${t("diag.hls.variant")}: ${say(v)}` }
    text = v.text ?? ""; base = v.url ?? vu
  }
  const seg = firstUri(text)
  if (!seg) return { status: "warn", line: t("diag.hls.noSeg") }
  const s = await probe(new URL(seg, base).href, { read: 262144 })
  if (s.kind === "ok") {
    const bw = s.kbps ? t("diag.hls.bw", { mbps: fmt.decimal(s.kbps / 1000, 1) }) : ""
    return { status: "ok", line: `${t("diag.hls.segOk", { kb: Math.round(s.bytes / 1024) })} · CORS: ${path === "direct" ? t("diag.yes") : t("diag.hls.viaProxy")} ${bw}`.trim() }
  }
  if (s.kind === "timeout") return { status: "warn", line: `${t("diag.hls.seg")}: ${say(s)}` }
  return { status: "fail", line: `${t("diag.hls.seg")}: ${s.kind === "cors" ? t("diag.hls.segCors") : say(s)}` }
}

function streamCheck(src: Source, item: Item, live: boolean): Check {
  const label = t(live ? "diag.str.live" : "diag.str.vod")
  return mk("streams", src, live ? "live" : "vod", `${label}: ${item.name}`, async () => {
    const raw = rawUrl(src, item, live)
    const hls = isHlsUrl(raw) || src.type === "plex" || src.type === "jellyfin"
    const via = streamPath(src, raw)
    const pu = px(raw, settings().proxy)
    const o = hls ? { read: 1 << 20, text: true } : { read: 131072 }
    try {
      const d = await probe(raw, o) // sequential on purpose: providers often allow one connection
      const p = pu !== raw ? await probe(pu, o) : undefined
      const v = verdict(d, p, via)
      let status = v.status, detail = `${t(via === "direct" ? "diag.str.pathDirect" : "diag.str.pathProxy")}\n${v.detail}`
      const m = via === "proxy" ? (p?.kind === "ok" ? p : d.kind === "ok" ? d : undefined) : d.kind === "ok" ? d : p?.kind === "ok" ? p : undefined
      if (hls && m) {
        const h = await hlsDeep(m, m === d ? "direct" : "proxy")
        detail += `\nHLS: ${h.line}`
        if (h.status !== "ok" && status === "ok") status = h.status
        if (h.status === "fail" && (status === "warn")) status = "fail"
      }
      return res(status, detail, v.hint ?? (status !== "ok" && hls ? t("diag.hls.hint") : undefined), v.ms)
    } finally {
      if (src.type === "plex") plexStopTranscode(src, item)
      if (src.type === "jellyfin") jellyfinStopTranscode(src, item)
    }
  }, { lock: `stream.${src.id}`, slow: true })
}

export function streamChecks(src: Source): Check[] {
  const items = [...useCatalog.getState().byId.values()].filter((i) => srcOfId(i.id) === src.id && !i.id.includes("|ep|"))
  const live = src.type === "plex" ? undefined : items.find((i) => i.kind === "live")
  const vod = items.find((i) => i.kind === "movie")
  const out: Check[] = []
  if (live) out.push(streamCheck(src, live, true))
  if (vod) out.push(streamCheck(src, vod, false))
  if (!out.length) out.push(mk("streams", src, "none", t("diag.str.sample"), async () => res("skip", t("diag.str.noCatalog"), t("diag.str.noCatalogHint"))))
  return out
}

export { httpSay }
