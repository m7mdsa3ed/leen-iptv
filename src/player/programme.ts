import { useEffect, useState } from "react"
import { useSourceOf } from "@/lib/sources"
import { useApp } from "@/lib/store"
import { jellyfinPrograms } from "@/lib/jellyfin"
import { xtreamShortEpg } from "@/lib/xtream"
import type { Item } from "@/lib/types"

export type Programme = { title: string; start: number; end: number; plot?: string }
type Raw = Record<string, unknown>

const time = (v: unknown): number => {
  if (typeof v === "number" || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) { const n = Number(v); return n > 1e12 ? n : n * 1000 }
  const n = typeof v === "string" ? Date.parse(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const fromXtream = (x: Raw): Programme => ({ title: String(x.title ?? x.name ?? ""), start: time(x.start_timestamp ?? x.start), end: time(x.stop_timestamp ?? x.end_timestamp ?? x.stop ?? x.end), plot: x.description ? String(x.description) : undefined })
const fromJellyfin = (x: Raw): Programme => ({ title: String(x.Name ?? ""), start: time(x.StartDate), end: time(x.EndDate), plot: x.Overview ? String(x.Overview) : undefined })
const valid = (x: Programme) => !!x.title && x.start > 0 && x.end > x.start

/** Now / next on the playing channel (Xtream short EPG or Jellyfin guide), refreshed every 5 minutes; nothing when the source has no guide. */
export function useProgramme(item: Item) {
  const source = useSourceOf(item)
  const proxy = useApp((s) => s.settings.proxy)
  const [rows, setRows] = useState<Programme[]>([])
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let alive = true
    setRows([])
    if (item.kind !== "live" || !item.sid || (source?.type !== "xtream" && source?.type !== "jellyfin")) return
    const src = source, sid = item.sid
    const load = () => (src.type === "xtream" ? xtreamShortEpg(src, proxy, sid).then((r) => r.map(fromXtream)) : jellyfinPrograms(src, proxy, sid).then((r) => r.map(fromJellyfin)))
      .then((list) => { if (alive) setRows(list.filter(valid).sort((a, b) => a.start - b.start)) }, () => {})
    void load()
    const id = window.setInterval(() => void load(), 5 * 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [item.id, item.sid, source?.id, proxy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id) }, []) // the progress bar moves
  const current = rows.find((x) => x.start <= now && x.end > now)
  const next = rows.find((x) => x.start >= (current?.end ?? now))
  return { current, next, pct: current ? Math.max(0, Math.min(100, ((now - current.start) / (current.end - current.start)) * 100)) : 0 }
}
