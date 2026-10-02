import { fmt } from "@/lib/i18n"

export const HIDE_MS = 5000 // controls auto-hide, same on tv / desktop / mobile
export const BANNER_MS = 4000 // title banner after a channel / episode change
export const NEXT_LEAD = 25 // seconds before the end when the "next episode" card appears
export const NEXT_SECS = 10 // its countdown

export const mmss = (s: number) => {
  s = Math.max(0, Math.floor(s))
  const h = Math.floor(s / 3600)
  return `${h ? h + ":" : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`.replace(/\d/g, (d) => fmt.number(+d))
}

export const isEpisode = (id: string) => id.includes("|ep|")
/** Episode items are named "<Series> S1E2": season + episode number. */
export const epOf = (name: string) => { const m = name.match(/\sS(\d+)E(\d+)$/); return m ? { s: +m[1], e: +m[2] } : null }
export const speedLabel = (n: number) => `${fmt.digits(n)}x`

/** Title + subtitle line shared by the top bar and the More panel (episodes: series + S/E; live: number + category; movies: year + category). */
export function describe(item: { id: string; kind: string; name: string; group: string; num?: number; year?: string }, t: (k: string, v?: Record<string, string | number>) => string) {
  const ep = isEpisode(item.id) ? epOf(item.name) : null
  const title = isEpisode(item.id) && item.group ? item.group : item.name
  const sub = (item.kind === "live" ? [item.num ? fmt.number(item.num) : "", item.group] : ep ? [t("player.epShort", { s: ep.s, e: ep.e })] : [item.year ? fmt.digits(item.year) : "", item.group]).filter(Boolean).join("  ·  ")
  return { title, sub }
}

export const fsEl = () => document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
