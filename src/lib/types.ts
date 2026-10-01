export type Kind = "live" | "movie" | "series"

export interface Item {
  id: string // `${sourceId}|${kind}|${raw}` - unique across sources
  kind: Kind
  name: string
  group: string
  logo?: string
  url?: string // M3U entries and episodes; Xtream live/movie URLs are built from sid
  sid?: string // Xtream stream_id / series_id
  ext?: string
  epgId?: string
  num?: number
  rating?: string
  plot?: string
  genres?: string[] // Plex: genres come with the catalog
  year?: string
  backdrop?: string
  resume?: number // seconds watched on the server (Plex)
  dur?: number // seconds
  srcId?: string // source id (also item.id.split("|")[0])
  origGroup?: string // category name in its own source when merged under another display name
  alts?: Item[] // same title from lower-priority sources (movie/series primary only)
}

export interface Source {
  id: string
  name: string
  type: "m3u" | "xtream" | "plex"
  url?: string
  epgUrl?: string
  server?: string
  user?: string
  pass?: string
  token?: string // Plex server access token (server = chosen connection URI)
  serverId?: string // Plex machine identifier
  conns?: { uri: string; local?: boolean; relay?: boolean; protocol?: string }[] // every address plex.tv gave for this server
  connMode?: "auto" | "norelay" | "local" // which of those addresses may be used (default auto)
  enabled?: boolean // default true
  color?: string // hex; default per type
  label?: string // short chip text; default per type
}

export interface Profile {
  id: string
  name: string
  color: string
  pin?: string
  locked: string[] // `${kind}|${group}`
}

export interface Prog {
  s: number
  e: number
  t: string
  d?: string
}

export interface Episode {
  id: string
  season: number
  num: number
  title: string
  item: Item
  dur?: string
}
