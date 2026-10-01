// IPTV names are messy: "AR - The Weight (2023) [4K]". Providers need the bare title (+ year when it is bracketed).
const NOISE = /\b(4k|uhd|fhd|hd|sd|hdr10?\+?|hevc|x26[45]|h\.?26[45]|web-?dl|web-?rip|blu-?ray|brrip|dvdrip|hdtv|2160p|1080p|720p|480p|dubbed|subbed|multi)\b/gi
const YEAR = /[([]\s*((?:19|20)\d{2})\s*[)\]]/

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

/** Comparison key: lowercase, no accents or punctuation. */
export const norm = (name: string) =>
  cleanTitle(name).title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
