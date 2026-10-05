// IPTV names are messy: "AR - The Weight (2023) [4K]". Providers need the bare title (+ year when it is bracketed).
const NOISE = /\b(4k|uhd|fhd|hd|sd|hdr10?\+?|hdr|dolby[ .-]?vision|hevc|x26[45]|h\.?26[45]|av1|vp9|10[ .-]?bit|8[ .-]?bit|hdcam(?:rip)?|hdts|cam(?:rip)?|telesync|telecine|workprint|screener|bluray|blu[ .-]?ray|brrip|bdrip|bdr|dvdrip|dvd|hdtv|pdtv|dsr|web[ .-]?dl|web[ .-]?rip|webrip|webdl|proper|repack|rerip|limited|extended|unrated|remastered|internal|readnfo|aac\d?(?:\.\d)?|e-?ac-?3|ac-?3|ddp?\+?\d?(?:\.\d)?|truehd|dts(?:-hd)?(?:[ .-]?ma)?|atmos|mp3|flac|2160p|1080p|720p|576p|540p|480p|360p|dubbed|subbed|multi)\b/gi
const YEAR = /[([]\s*((?:19|20)\d{2})\s*[)\]]/

/** The bracketed year of a name, as cleanTitle() reads it (cheap: one regex). */
export const yearOf = (name: string) => name.match(YEAR)?.[1]

export function cleanTitle(name: string): { title: string; year?: string } {
  let s = name
  const year = s.match(YEAR)?.[1]
  s = s.replace(/[([{][^)\]}]*[)\]}]/g, " ") // (2023) [4K] {AR}
  s = s.replace(/^\s*\|[^|]*\|\s*/, "") // |EN| prefix
  s = s.replace(/^\s*[A-Za-z]{2,3}\s*[-:|]\s+/, "") // "AR - " / "EN: " prefix
  s = s.replace(/\s+[-|]\s*[A-Za-z]{2}\s*$/, "") // " - AR" suffix
  s = s.replace(NOISE, " ").replace(/[-|:\s]+$/, "").replace(/\s+/g, " ").trim()
  return { title: s || name.trim(), year }
}

/** Key of a manual match: what the title IS (kind + cleaned name + year), so every copy of it shares the match. Build it from the source's name (`srcName ?? name`). */
export const matchKeyOf = (kind: string, name: string) => { const c = cleanTitle(name); return `${kind}:${norm(c.title)}:${c.year ?? ""}` }
export const matchId = (v: string | { id: string } | undefined) => (typeof v === "string" ? v : v?.id)

/** A usable TMDB id, or undefined: panels send "", "0", "N/A" or junk. */
export const tmdbId = (v: unknown) => (/^[1-9]\d*$/.test(String(v ?? "").trim()) ? String(v).trim() : undefined)

/** Comparison key: lowercase, no accents or punctuation. */
export const norm = (name: string) =>
  cleanTitle(name).title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
