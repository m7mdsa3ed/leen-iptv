// Per-device player preferences (volume, mute, aspect, speed). Plain localStorage; never synced.
export const FITS = ["contain", "cover", "fill"] as const
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const

type P = { vol: number; muted: boolean; fit: number; speed: number }
const K = "leen-player"
const DEF: P = { vol: 1, muted: false, fit: 0, speed: 1 }

const read = (): P => {
  try {
    const r = JSON.parse(localStorage.getItem(K) || "{}") as Partial<P>
    return {
      vol: typeof r.vol === "number" && r.vol >= 0 && r.vol <= 1 ? r.vol : DEF.vol,
      muted: r.muted === true,
      fit: typeof r.fit === "number" && r.fit >= 0 && r.fit < FITS.length ? r.fit : DEF.fit,
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
