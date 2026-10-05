import { useSyncExternalStore } from "react"
// Per-device player preferences (volume, mute, aspect, speed). Plain localStorage; never synced.
export const FITS = ["contain", "cover", "fill"] as const
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

export const SUB_SIZES = [75, 100, 125, 150, 200] as const

// Sleep-timer presets in minutes (not persisted: a leftover timer on reload would be surprising)
export const SLEEP_MIN = [15, 30, 45, 60, 90] as const

/** Subtitle look (drawn by player/subtitles.tsx). Each option is a short list the player sheet steps through and Settings shows as chips. */
export const SUB_STYLE = {
  subFont: ["default", "sans", "serif", "mono"],
  subColor: ["white", "yellow", "cyan", "green"],
  subOpacity: [100, 75, 50], // text, %
  subBg: ["none", "box", "solid"],
  subEdge: ["outline", "shadow", "none"],
  subLine: [1.1, 1.25, 1.5], // line height
  subWidth: [95, 80, 60], // max line width, % of the screen
  subAlign: ["center", "start"],
  subPos: [4, 8, 14, 20, 28], // % of the height from the bottom
  subBold: [false, true],
  subNoHi: [false, true], // drop [sounds], (sounds), ♪ lyrics ♪ and NAME: labels
  subRtlFix: [false, true], // ".مرحبا" -> "مرحبا." for files saved for left-to-right players
} as const
export type SubStyleKey = keyof typeof SUB_STYLE
type SubStyle = { [K in SubStyleKey]: (typeof SUB_STYLE)[K][number] }

// audioLang / subLang: last picked language (ISO code) on a media server; subLang "off" = subtitles were turned off
type P = { vol: number; muted: boolean; fit: number; speed: number; subSize: number; audioLang: string; subLang: string } & SubStyle
const K = "leen-player"
const DEF: P = { vol: 1, muted: false, fit: 0, speed: 1, subSize: 100, audioLang: "", subLang: "", subFont: "default", subColor: "white", subOpacity: 100, subBg: "none", subEdge: "outline", subLine: 1.25, subWidth: 95, subAlign: "center", subPos: 8, subBold: false, subNoHi: false, subRtlFix: false }
const pick = <T,>(list: readonly T[], v: unknown, d: T): T => (list.includes(v as T) ? (v as T) : d)

const read = (): P => {
  try {
    const r = JSON.parse(localStorage.getItem(K) || "{}") as Partial<P>
    return {
      vol: typeof r.vol === "number" && r.vol >= 0 && r.vol <= 1 ? r.vol : DEF.vol,
      muted: r.muted === true,
      fit: typeof r.fit === "number" && r.fit >= 0 && r.fit < FITS.length ? r.fit : DEF.fit,
      subSize: (SUB_SIZES as readonly number[]).includes(r.subSize as number) ? (r.subSize as number) : DEF.subSize,
      audioLang: typeof r.audioLang === "string" ? r.audioLang : "",
      subLang: typeof r.subLang === "string" ? r.subLang : "",
      speed: (SPEEDS as readonly number[]).includes(r.speed as number) ? (r.speed as number) : DEF.speed,
      subFont: pick(SUB_STYLE.subFont, r.subFont, DEF.subFont), subColor: pick(SUB_STYLE.subColor, r.subColor, DEF.subColor),
      subBg: pick(SUB_STYLE.subBg, r.subBg, DEF.subBg), subEdge: pick(SUB_STYLE.subEdge, r.subEdge, DEF.subEdge),
      subPos: pick(SUB_STYLE.subPos, r.subPos, DEF.subPos), subBold: pick(SUB_STYLE.subBold, r.subBold, DEF.subBold),
      subOpacity: pick(SUB_STYLE.subOpacity, r.subOpacity, DEF.subOpacity), subLine: pick(SUB_STYLE.subLine, r.subLine, DEF.subLine),
      subWidth: pick(SUB_STYLE.subWidth, r.subWidth, DEF.subWidth), subAlign: pick(SUB_STYLE.subAlign, r.subAlign, DEF.subAlign),
      subNoHi: pick(SUB_STYLE.subNoHi, r.subNoHi, DEF.subNoHi), subRtlFix: pick(SUB_STYLE.subRtlFix, r.subRtlFix, DEF.subRtlFix),
    }
  } catch { return { ...DEF } }
}

let cache: P | null = null
export const prefs = (): P => (cache ??= read())
const subs = new Set<() => void>()
export function setPrefs(p: Partial<P>) {
  cache = { ...prefs(), ...p }
  try { localStorage.setItem(K, JSON.stringify(cache)) } catch { /* storage full / blocked */ }
  subs.forEach((f) => f())
}
/** Re-render on any change (the subtitle look is edited from the player sheet and from Settings). */
export const usePrefs = () => useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), prefs)
