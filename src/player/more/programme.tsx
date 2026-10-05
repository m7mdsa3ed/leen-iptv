import { useEffect, useState } from "react"
import { useSourceOf } from "@/lib/sources"
import { fmt, useT } from "@/lib/i18n"
import { useApp } from "@/lib/store"
import { jellyfinPrograms } from "@/lib/jellyfin"
import { xtreamShortEpg } from "@/lib/xtream"
import type { Item } from "@/lib/types"
import { Chip, Section } from "./parts"

type Programme = { title: string; start: number; end: number; plot?: string }
type Raw = Record<string, unknown>

const time = (v: unknown): number => {
  if (typeof v === "number" || (typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v))) {
    const n = Number(v)
    return n > 1e12 ? n : n * 1000
  }
  const n = typeof v === "string" ? Date.parse(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const fromXtream = (x: Raw): Programme => ({
  title: String(x.title ?? x.name ?? ""),
  start: time(x.start_timestamp ?? x.start),
  end: time(x.stop_timestamp ?? x.end_timestamp ?? x.stop ?? x.end),
  plot: x.description ? String(x.description) : undefined,
})
const fromJellyfin = (x: Raw): Programme => ({
  title: String(x.Name ?? ""),
  start: time(x.StartDate),
  end: time(x.EndDate),
  plot: x.Overview ? String(x.Overview) : undefined,
})

/** Fetches guide rows only for the currently playing channel; missing/unsupported guide data is simply not shown. */
export function useProgramme(item: Item) {
  const source = useSourceOf(item)
  const proxy = useApp((s) => s.settings.proxy)
  const [rows, setRows] = useState<Programme[]>([])
  useEffect(() => {
    let alive = true
    setRows([])
    if (item.kind !== "live" || !item.sid || (source?.type !== "xtream" && source?.type !== "jellyfin")) return
    const load = source.type === "xtream"
      ? xtreamShortEpg(source, proxy, item.sid).then((r) => r.map(fromXtream))
      : jellyfinPrograms(source, proxy, item.sid).then((r) => r.map(fromJellyfin))
    void load.then((list) => { if (alive) setRows(list.filter((x) => x.title && x.start > 0 && x.end > x.start).sort((a, b) => a.start - b.start)) }, () => { if (alive) setRows([]) })
    const timer = window.setInterval(() => {
      const src = source
      if (src.type === "xtream") void xtreamShortEpg(src, proxy, item.sid!).then((r) => alive && setRows(r.map(fromXtream).filter(valid).sort((a, b) => a.start - b.start)), () => {})
      else void jellyfinPrograms(src, proxy, item.sid!).then((r) => alive && setRows(r.map(fromJellyfin).filter(valid).sort((a, b) => a.start - b.start)), () => {})
    }, 5 * 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [item.id, item.sid, source, proxy])
  const now = Date.now()
  const current = rows.find((x) => x.start <= now && x.end > now)
  const next = rows.find((x) => x.start >= (current?.end ?? now))
  return { current, next, now }
}

const valid = (x: Programme) => x.title && x.start > 0 && x.end > x.start

export function ProgrammeInfo({ item, compact = false }: { item: Item; compact?: boolean }) {
  const t = useT()
  const { current, next, now } = useProgramme(item)
  if (!current && !next) return null
  const progress = current ? Math.max(0, Math.min(100, ((now - current.start) / (current.end - current.start)) * 100)) : 0
  const content = <div className={compact ? "mb-3 max-w-xl" : "max-w-3xl"}>
    {current && <div className="mb-2">
      <div className="flex flex-wrap items-center gap-2"><Chip>{t("player.more.programme")}</Chip><span dir="auto" className="font-medium">{current.title}</span><span dir="ltr" data-ltr className="text-sm text-muted-foreground">{fmt.time(current.start)} - {fmt.time(current.end)}</span><Chip>{t("player.more.programmeProgress", { n: Math.floor(progress) })}</Chip></div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${progress}%` }} /></div>
      {current.plot && <p dir="auto" className="mt-2 text-sm text-muted-foreground">{current.plot}</p>}
    </div>}
    {next && <div className="flex flex-wrap items-center gap-2"><Chip>{t("player.more.nextProgramme")}</Chip><span dir="auto">{next.title}</span><span dir="ltr" data-ltr className="text-sm text-muted-foreground">{fmt.time(next.start)} - {fmt.time(next.end)}</span></div>}
  </div>
  return compact ? content : <Section title={item.name}>{content}</Section>
}
