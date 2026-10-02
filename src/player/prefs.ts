// Per-device player preferences (volume, mute, aspect, speed). Plain localStorage; never synced.
export const FITS = ["contain", "cover", "fill"] as const
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

export const SUB_SIZES = [75, 100, 125, 150, 200] as const

// audioLang / subLang: last picked language (ISO code) on a media server; subLang "off" = subtitles were turned off
type P = { vol: number; muted: boolean; fit: number; speed: number; subSize: number; audioLang: string; subLang: string }
const K = "leen-player"
const DEF: P = { vol: 1, muted: false, fit: 0, speed: 1, subSize: 100, audioLang: "", subLang: "" }

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
    }
  } catch { return { ...DEF } }
}

let cache: P | null = null
export const prefs = (): P => (cache ??= read())
export function setPrefs(p: Partial<P>) {
  cache = { ...prefs(), ...p }
  try { localStorage.setItem(K, JSON.stringify(cache)) } catch { /* storage full / blocked */ }
}
