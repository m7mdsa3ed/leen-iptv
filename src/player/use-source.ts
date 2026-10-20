import { useEffect, useState } from "react"
import { useApp } from "@/lib/store"
import { useSourceOf } from "@/lib/sources"
import { mixed, px, pxStream } from "@/lib/net"
import type { Item } from "@/lib/types"
import type { StreamQ } from "@/lib/quality"
import { plexDirectUrl, plexStreamUrl, plexSubtitle, plexTracks } from "@/lib/plex"
import { jellyfinStreamUrl, jellyfinSubtitle, jellyfinTracks } from "@/lib/jellyfin"
import type { SrvTrack } from "@/lib/plex-pure"
import { xtreamUrl } from "@/lib/xtream"

/** Audio / subtitle picked on a media server (its own track ids). */
export type Picked = { audio?: number; sub?: number }
const NONE = { audio: [] as SrvTrack[], subs: [] as SrvTrack[] }

/**
 * Which URL plays `item`, and how. Plex and Jellyfin play DIRECT from the browser to the server (it can be on the viewer's LAN while
 * the app is served from elsewhere, where the app's proxy could not reach it); the proxy only for mixed content, when forced in
 * Settings, or after the direct manifest failed (`toProxy`). Plex Original plays the file itself and falls back to the transcoder when
 * this device can't decode it (`fallback`). Media servers also list their audio / subtitle tracks; a text subtitle is fetched as WebVTT
 * (`sidecar`), anything else is burned into a new stream.
 */
export function useSource(item: Item, q: StreamQ, picked: Picked) {
  const settings = useApp((s) => s.settings)
  const live = item.kind === "live"
  const src = useSourceOf(item)
  const plex = src?.type === "plex" ? src : null
  const jf = src?.type === "jellyfin" ? src : null
  const mediaServer = !!(plex || jf)

  const [srv, setSrv] = useState({ id: "", ...NONE }) // tagged with the item it belongs to
  useEffect(() => {
    if (live || !mediaServer) return
    let on = true
    const done = (r: typeof NONE) => { if (on) setSrv({ id: item.id, ...r }) }
    void (plex ? plexTracks(plex, item) : jellyfinTracks(jf!, item)).then(done, () => done(NONE))
    return () => { on = false }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const tracks = srv.id === item.id ? srv : NONE

  const text = mediaServer ? tracks.subs.find((x) => x.id === picked.sub && x.text) : undefined
  const [vtt, setVtt] = useState({ key: "", text: "" })
  useEffect(() => {
    if (!text) return
    let on = true
    const key = `${item.id}|${text.id}`
    const put = (t: string) => { if (on) setVtt({ key, text: t }) }
    void (plex ? plexSubtitle(plex, item, text, { alive: () => on, onUpdate: put }) : jellyfinSubtitle(jf!, item, text.id)).then(put, () => put(""))
    return () => { on = false }
  }, [item.id, text?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const sidecar = text && vtt.key === `${item.id}|${text.id}` ? vtt.text : null

  const burn = { audio: picked.audio, sub: text ? undefined : picked.sub } // a text subtitle is a sidecar, never burned in
  const [noFile, setNoFile] = useState("") // item whose Plex file the <video> refused
  const file = plex && noFile !== item.id ? plexDirectUrl(plex, item, q, burn) : undefined
  const raw = item.url ?? file ?? (plex ? plexStreamUrl(plex, item, q, burn) : jf ? jellyfinStreamUrl(jf, item, q, burn) : xtreamUrl(src!, live ? "live" : "movie", item.sid!, live ? settings.liveExt : item.ext || "mp4"))
  const [proxied, setProxied] = useState("") // raw URL whose direct manifest failed
  const direct = mediaServer && !mixed(raw) && !settings.proxyStreams && proxied !== raw
  const url = direct ? raw : mediaServer && mixed(raw) ? px(raw, settings.proxy) : pxStream(raw, settings)

  return {
    live, src, plex, jf, mediaServer, raw, url, direct, tracks, tracksReady: srv.id === item.id, sidecar,
    toProxy: () => setProxied(raw),
    fallback: file ? () => setNoFile(item.id) : undefined,
  }
}
