// Pure watch-history math (no alias imports so `node scripts/stats.check.ts` can run it).
export type SKind = "live" | "movie" | "episode"
export interface Session {
  id: string
  item: string // catalog item id
  kind: SKind
  name: string
  group: string // category, or the series name for episodes
  logo?: string
  src: string // source id
  start: number
  sec: number // seconds actually watched (paused time not counted)
  pos?: number
  dur?: number
  stalls: number
  errors: number
  startupMs?: number // attach -> first frame
  q?: "good" | "fair" | "poor" // last connection-quality rating
  mbps?: number // average measured link speed
}
export interface Day { sec: number; sessions: number; live: number; movie: number; series: number }

export const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const emptyDay = (): Day => ({ sec: 0, sessions: 0, live: 0, movie: 0, series: 0 })

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** GitHub-style activity grid: WEEKS columns (oldest first) x 7 rows (Sun..Sat); cells after today are null. */
export const WEEKS = 18
export function calendarWeeks(days: Record<string, Day>, now = Date.now()): ({ key: string; sec: number } | null)[][] {
  const today = new Date(now)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (WEEKS - 1) * 7) // Sunday of the first week
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const t = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      if (t.getTime() > now) return null
      const key = dayKey(t.getTime())
      return { key, sec: days[key]?.sec ?? 0 }
    }),
  )
}

/** 0..4 intensity of `v` against the largest value. */
export const level = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)))

export function computeStats(sessions: Session[], days: Record<string, Day>, now = Date.now()) {
  const keys = Object.keys(days)
  const total = sum(keys.map((k) => days[k].sec))
  const count = sum(keys.map((k) => days[k].sessions))
  const back = (n: number) => dayKey(now - n * 864e5)
  const within = (n: number) => sum(Array.from({ length: n }, (_, i) => days[back(i)]?.sec ?? 0))
  // streak: consecutive days with watching, counting back from today (or yesterday if nothing yet today)
  let streak = 0
  for (let i = days[back(0)]?.sec ? 0 : 1; days[back(i)]?.sec; i++) streak++
  const last14 = Array.from({ length: 14 }, (_, i) => { const k = back(13 - i); return { key: k, sec: days[k]?.sec ?? 0 } })

  const byTitle = new Map<string, { name: string; group: string; logo?: string; sec: number; plays: number }>()
  const byGroup = new Map<string, number>()
  const hours = Array(24).fill(0) as number[]
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]) // [weekday Sun..Sat][hour] = seconds
  for (const s of sessions) {
    const t = s.kind === "episode" ? s.group : s.item // episodes roll up to their series
    const e = byTitle.get(t) ?? { name: s.kind === "episode" ? s.group : s.name, group: s.group, logo: s.logo, sec: 0, plays: 0 }
    e.sec += s.sec; e.plays++
    byTitle.set(t, e)
    byGroup.set(s.group, (byGroup.get(s.group) ?? 0) + s.sec)
    const st = new Date(s.start)
    hours[st.getHours()] += s.sec
    heat[st.getDay()][st.getHours()] += s.sec
  }
  const watched = sessions.filter((s) => s.sec > 0)
  const errors = sum(sessions.map((s) => s.errors))
  const stalls = sum(sessions.map((s) => s.stalls))
  const startups = sessions.map((s) => s.startupMs).filter((x): x is number => typeof x === "number")
  const speeds = sessions.map((s) => s.mbps).filter((x): x is number => typeof x === "number")
  const q = { good: 0, fair: 0, poor: 0 }
  for (const s of sessions) if (s.q) q[s.q]++
  const hrs = sum(sessions.map((s) => s.sec)) / 3600
  return {
    total, count, avg: count ? total / count : 0,
    today: within(1), week: within(7), month: within(30), streak, last14,
    kinds: { live: sum(keys.map((k) => days[k].live)), movie: sum(keys.map((k) => days[k].movie)), series: sum(keys.map((k) => days[k].series)) },
    topTitles: [...byTitle.values()].sort((a, b) => b.sec - a.sec).slice(0, 8),
    topGroups: [...byGroup].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, sec]) => ({ name, sec })),
    hours,
    heat,
    calendar: calendarWeeks(days, now),
    health: {
      sessions: sessions.length, errors, stalls,
      errorRate: sessions.length ? errors / sessions.length : 0,
      stallsPerHour: hrs > 0 ? stalls / hrs : 0,
      avgStartupMs: startups.length ? sum(startups) / startups.length : 0,
      avgMbps: speeds.length ? sum(speeds) / speeds.length : 0,
      quality: q,
    },
    hasData: total > 0 || watched.length > 0,
  }
}

