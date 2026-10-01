import { create } from "zustand"
import { get as idbGet, set as idbSet } from "idb-keyval"
import { dayKey, emptyDay, type Day, type Session } from "./stats"

const MAX_SESSIONS = 1500 // older sessions are dropped, but their time stays in `days`

interface H {
  profileId: string | null
  sessions: Session[]
  days: Record<string, Day>
  load: (profileId: string) => Promise<void>
  /** Begin a playback session; returns its id. Call after load(). */
  start: (s: Pick<Session, "item" | "kind" | "name" | "group" | "logo" | "src">) => string
  /** Add `sec` watched seconds (and day totals) and merge a patch of the latest measurements. */
  tick: (id: string, sec: number, patch?: Partial<Session>) => void
  patch: (id: string, patch: Partial<Session>) => void
  remove: (id: string) => void
  clear: () => void
}

let timer = 0
const save = () => {
  const { profileId, sessions, days } = useHistory.getState()
  if (profileId) void idbSet(`hist:${profileId}`, { sessions, days })
}
const schedule = () => { clearTimeout(timer); timer = window.setTimeout(save, 2000) }

export const useHistory = create<H>((set, get) => ({
  profileId: null,
  sessions: [],
  days: {},
  async load(pid) {
    if (get().profileId === pid) return
    set({ profileId: pid, sessions: [], days: {} })
    const d = await idbGet<{ sessions: Session[]; days: Record<string, Day> }>(`hist:${pid}`)
    if (get().profileId === pid && d) set({ sessions: d.sessions, days: d.days }) // a different profile may have loaded meanwhile
  },
  start(s) {
    const t = Date.now()
    const id = `${t}-${Math.random().toString(36).slice(2, 7)}`
    const k = dayKey(t)
    set((st) => ({
      sessions: [{ ...s, id, start: t, sec: 0, stalls: 0, errors: 0 }, ...st.sessions].slice(0, MAX_SESSIONS),
      days: { ...st.days, [k]: { ...(st.days[k] ?? emptyDay()), sessions: (st.days[k]?.sessions ?? 0) + 1 } },
    }))
    schedule()
    return id
  },
  tick(id, sec, patch) {
    const k = dayKey(Date.now())
    set((st) => {
      const s = st.sessions.find((x) => x.id === id)
      if (!s) return st
      const d = st.days[k] ?? emptyDay()
      const kind = s.kind === "live" ? "live" : s.kind === "movie" ? "movie" : "series"
      return {
        sessions: st.sessions.map((x) => (x.id === id ? { ...x, ...patch, sec: x.sec + sec } : x)),
        days: { ...st.days, [k]: { ...d, sec: d.sec + sec, [kind]: d[kind] + sec } },
      }
    })
    schedule()
  },
  patch(id, patch) {
    set((st) => ({ sessions: st.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
    schedule()
  },
  remove(id) { set((st) => ({ sessions: st.sessions.filter((x) => x.id !== id) })); schedule() }, // day totals keep the time: stats are not rewritten
  clear() { set({ sessions: [], days: {} }); schedule() },
}))

export const flushHistory = save
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", save)
  document.addEventListener("visibilitychange", () => document.hidden && save())
}
