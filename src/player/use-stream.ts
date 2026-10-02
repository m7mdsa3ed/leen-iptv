import { useState } from "react"
import { useApp } from "@/lib/store"
import { useSourceOf } from "@/lib/sources"
import { mixed, px, pxStream } from "@/lib/net"
import type { Item } from "@/lib/types"
import type { StreamQ } from "@/lib/quality"
import { plexStreamUrl } from "@/lib/plex"
import { jellyfinStreamUrl } from "@/lib/jellyfin"
import { xtreamUrl } from "@/lib/xtream"

/** Which URL plays an item, and whether it goes direct or through the proxy. */
export function useStream(item: Item, sq: StreamQ) {
  const settings = useApp((s) => s.settings)
  const live = item.kind === "live"
  const src = useSourceOf(item) // the item's own source (multi-source)
  const plex = src?.type === "plex" ? src : null
  const jf = src?.type === "jellyfin" ? src : null
  const raw = item.url ?? (plex ? plexStreamUrl(plex, item, sq) : jf ? jellyfinStreamUrl(jf, item, sq) : xtreamUrl(src!, live ? "live" : "movie", item.sid!, live ? settings.liveExt : item.ext || "mp4"))
  // Jellyfin plays DIRECT from the browser to the server (it can be on the viewer's LAN while this app is served from elsewhere,
  // e.g. over Tailscale, where the app's own proxy could not reach it). Proxy only for mixed content, when the user forces it,
  // or after a network/CORS failure (proxied flag below).
  const [proxied, setProxied] = useState("")
  const mediaServer = !!(plex || jf)
  const direct = !!jf && !mixed(raw) && !settings.proxyStreams && proxied !== raw
  const url = direct ? raw : mediaServer && mixed(raw) ? px(raw, settings.proxy) : pxStream(raw, settings)
  return { live, src, plex, jf, raw, url, direct, mediaServer, setProxied }
}
