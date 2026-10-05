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

/** Which URL plays an item, and whether it goes direct or through the proxy. */
export type Picked = { audio?: number; sub?: number }
const NO_TRACKS = { audio: [] as SrvTrack[], subs: [] as SrvTrack[] }

export function useStream(item: Item, sq: StreamQ, tr: Picked) {
  const settings = useApp((s) => s.settings)
  const live = item.kind === "live"
  const src = useSourceOf(item) // the item's own source (multi-source)
  const plex = src?.type === "plex" ? src : null
  const jf = src?.type === "jellyfin" ? src : null
  // Plex and Jellyfin play DIRECT from the browser to the server (it can be on the viewer's LAN while this app is served from elsewhere,
  // e.g. over Tailscale, where the app's own proxy could not reach it). Proxy only for mixed content, when the user forces it,
  // or after a network/CORS failure (proxied flag below).
  const [proxied, setProxied] = useState("")
  const [srv, setSrv] = useState({ id: "", ...NO_TRACKS }) // media-server audio/subtitle lists, tagged with the item they belong to
  useEffect(() => {
    if (live || !(plex || jf)) return
    let on = true
    const done = (r: typeof NO_TRACKS) => on && setSrv({ id: item.id, ...r })
    void (plex ? plexTracks(plex, item) : jellyfinTracks(jf!, item)).then(done, () => done(NO_TRACKS))
    return () => { on = false }
  }, [item.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const tracks = srv.id === item.id ? srv : NO_TRACKS
  // Text subtitles (Jellyfin / Plex) are fetched as WebVTT and shown by the player as a track (no new stream); anything else is burned into the stream
  const sc = (plex || jf) && tracks.subs.find((x) => x.id === tr.sub && x.text)
  const [vtt, setVtt] = useState({ key: "", text: "" })
  useEffect(() => {
    if (!sc) return
    let on = true
    const key = `${item.id}|${sc.id}`
    const set = (text: string) => { if (on) setVtt({ key, text }) }
    void (plex ? plexSubtitle(plex, item, sc, { alive: () => on, onUpdate: set }) : jellyfinSubtitle(jf!, item, sc.id)).then(set, () => set(""))
    return () => { on = false }
  }, [item.id, sc && sc.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const sidecar = sc && vtt.key === `${item.id}|${sc.id}` ? vtt.text : null
  const burn = { audio: tr.audio, sub: sc ? undefined : tr.sub }
  // Plex Original: the file itself when this device decodes it; back to the transcoder if the <video> fails on it (noDirect)
  const [noDirect, setNoDirect] = useState("")
  const file = plex && noDirect !== item.id ? plexDirectUrl(plex, item, sq, burn) : undefined
  const raw = item.url ?? file ?? (plex ? plexStreamUrl(plex, item, sq, burn) : jf ? jellyfinStreamUrl(jf, item, sq, burn) : xtreamUrl(src!, live ? "live" : "movie", item.sid!, live ? settings.liveExt : item.ext || "mp4"))
  const mediaServer = !!(plex || jf)
  const direct = mediaServer && !mixed(raw) && !settings.proxyStreams && proxied !== raw
  const url = direct ? raw : mediaServer && mixed(raw) ? px(raw, settings.proxy) : pxStream(raw, settings)
  return { tracks, tracksReady: srv.id === item.id, sidecar, live, src, plex, jf, raw, url, direct, mediaServer, setProxied, fallback: file ? () => setNoDirect(item.id) : undefined }
}
