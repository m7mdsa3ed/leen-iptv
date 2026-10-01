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
}

export interface Source {
  id: string
  name: string
  type: "m3u" | "xtream"
  url?: string
  epgUrl?: string
  server?: string
  user?: string
  pass?: string
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
