export type Kind = "live" | "movie" | "series"

export interface Item {
  id: string // `${sourceId}|${kind}|${raw}` - unique across sources
  kind: Kind
  name: string
  group: string
  logo?: string
  logoAlt?: string // live: the next-best logo, shown when `logo` fails to load
  url?: string // M3U entries and episodes; Xtream live/movie URLs are built from sid
  sid?: string // Xtream stream_id / series_id
  ext?: string
  epgId?: string // source channel id (tvg-id / epg_channel_id): used to match channel logos by iptv-org id
  num?: number
  rating?: string
  plot?: string
  genres?: string[] // Plex/Jellyfin: genres come with the catalog
  year?: string
  backdrop?: string
  resume?: number // seconds watched on the server (Plex/Jellyfin)
  dur?: number // seconds
  srcId?: string // source id (also item.id.split("|")[0])
  origGroup?: string // category name in its own source when merged under another display name
  series?: string // episodes: id of the series item
  alts?: Item[] // same title from lower-priority sources (movie/series primary only)
  epTitle?: string // episodes: the episode's own title (TMDB-enriched), shown by the player
  mposter?: boolean // `logo` is the metadata poster saved by Settings > Metadata > Replace posters
  srcName?: string // the source's own name, kept when a manual metadata match renamed the item (match keys are built from it)
}

/** A manual TMDB match (Settings `metaMatch`): the id, plus what the catalog shows instead of the panel's name/poster. A bare string = id only (older entries). */
export type MetaMatch = string | { id: string; title?: string; year?: string; poster?: string; backdrop?: string }

export interface Source {
  id: string
  name: string
  type: "m3u" | "xtream" | "plex" | "jellyfin"
  url?: string
  server?: string
  user?: string
  pass?: string
  token?: string // Plex server access token (server = chosen connection URI) / Jellyfin AccessToken
  userId?: string // Jellyfin user id
  serverId?: string // Plex machine identifier / Jellyfin server Id
  conns?: { uri: string; local?: boolean; relay?: boolean; protocol?: string }[] // every address plex.tv gave for this server
  connMode?: "auto" | "norelay" | "local" | "remote" // which addresses may be used (default auto); Plex: auto|norelay|local, Jellyfin: auto|local|remote
  localServer?: string // Jellyfin: address on the home network (`server` stays the ACTIVE one)
  remoteServer?: string // Jellyfin / Plex: address reachable over the internet (public domain, Tailscale...); Plex also mirrors it into conns
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

export interface Episode {
  id: string
  season: number
  num: number
  title: string
  item: Item
  dur?: string | number // number = seconds (formatted at render); string = raw provider text
}
