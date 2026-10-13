import { useEffect, useState, type ReactNode } from "react"
import { Check, Clock, ImageOff, Pause, Play, RefreshCw, SearchX, Settings, TriangleAlert, X } from "lucide-react"
import { Art, Pill } from "@/components/gtv"
import { useOpen } from "@/components/tv/ui"
import { useMode } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { queueSnapshot, retryUnmatched, setQueuePaused, useMetaQueue } from "@/lib/meta/queue"
import { normalizeCfg } from "@/lib/meta"
import { openMatch } from "@/components/tv/match"
import { useApp } from "@/lib/store"
import { rateSnapshot } from "@/lib/meta/rate"
import { PROVIDERS } from "@/lib/meta/providers"
import { useBackStep } from "@/lib/nav"
import { openSection } from "@/settings/open"
import type { Item } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_WAITING = 40

/** Top-bar activity chip (like Plex's): the count of titles waiting for a metadata lookup; pressing it lists them (lib/meta/queue.ts).
    The panel drops from the chip on desktop / TV and is a bottom sheet on phones. Back / Esc / a click outside closes it. */
export function MetaQueueButton() {
  const n = useMetaQueue((s) => s.n)
  const paused = useMetaQueue((s) => s.paused)
  const bad = useMetaQueue((s) => s.bad)
  const [open, setOpen] = useState(false)
  const tv = useMode() === "tv"
  useBackStep(open, () => setOpen(false))
  if (!n && !bad && !open) return null
  const label = n ? fmt.plural("gtv.shell.metaQueue", n) : fmt.plural("gtv.queue.needMatch", bad) // nothing queued: the chip stays for titles that need a manual match
  return (
    <>
      {(n > 0 || bad > 0) && (
        <button data-nav data-pill aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 font-medium tabular-nums text-muted-foreground", tv ? "min-h-11 px-4 text-base" : "min-h-8 px-2.5 text-xs")}>
          {!n ? <SearchX className={tv ? "size-4" : "size-3.5"} /> : paused ? <Pause className={tv ? "size-4" : "size-3.5"} /> : <RefreshCw className={cn("animate-spin", tv ? "size-4" : "size-3.5")} />}{fmt.number(n || bad)}
        </button>
      )}
      {open && <Panel close={() => setOpen(false)} />}
    </>
  )
}

function Panel({ close }: { close: () => void }) {
  const t = useT()
  useMetaQueue((s) => s.rev) // re-render on every queue change
  const { paused, waitUntil } = useMetaQueue()
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id) }, []) // the countdown and the per-minute counts
  const rates = rateSnapshot()
  const wait = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000))
  const mobile = useMode() === "mobile"
  const open = useOpen()
  const { now, waiting, recent, unmatched } = queueSnapshot()
  const hasTmdb = normalizeCfg(useApp((s) => s.settings.meta)).some((c) => c.id === "tmdb" && c.enabled && c.key) // matching searches TMDB (as in Fix matches)
  const pick = (i: Item) => { close(); void open(i) }
  const match = (i: Item) => { close(); if (hasTmdb) openMatch(i); else void open(i) }
  const row = (i: Item, status: ReactNode, key = i.id, onClick = pick) => (
    <button key={key} data-nav data-pill onClick={() => onClick(i)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-start hover:bg-[var(--fg-10)]">
      <Art item={i} className="w-8 shrink-0 rounded-md text-[10px]" />
      <span className="min-w-0 flex-1"><span dir="auto" className="block truncate text-base">{i.name}</span>{i.year && <span className="block text-xs text-muted-foreground">{fmt.digits(i.year)}</span>}</span>
      {status}
    </button>
  )
  const head = (text: string, count?: number) => <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{text}{count != null && <span className="ms-1.5 tabular-nums">{fmt.number(count)}</span>}</h3>
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("gtv.queue.title")} onClick={(e) => e.target === e.currentTarget && close()}
      className={cn("fixed inset-0 z-50 flex m-fade", mobile ? "items-end bg-black/50" : "items-start justify-end bg-black/30 pe-[var(--gx)] pt-[calc(var(--hdr)+.25rem)]")}>
      <div className={cn("flex flex-col overflow-hidden bg-surface text-foreground shadow-2xl", mobile ? "m-rise max-h-[80vh] w-full rounded-t-[28px] border-t border-[var(--fg-10)] pb-[var(--safe-b)]" : "m-pop max-h-[min(36rem,calc(100vh-var(--hdr)-2rem))] w-[26rem] rounded-[28px]")}>
        <div className="flex items-center gap-2 px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-lg font-medium">{t("gtv.queue.title")}</h2>
          <Pill data-autofocus className="min-h-10 px-4 text-sm" onClick={() => setQueuePaused(!paused)}>{paused ? <Play /> : <Pause />}{t(paused ? "gtv.queue.resume" : "gtv.queue.pause")}</Pill>
          <button data-nav data-pill aria-label={t("common.close")} onClick={close} className="grid size-10 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
        </div>
        {(paused || wait > 0) && (
          <p role="status" className={cn("mx-4 mb-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm", paused ? "bg-surface-2 text-muted-foreground" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>
            {paused ? <Pause className="size-4 shrink-0" /> : <TriangleAlert className="size-4 shrink-0" />}
            {paused ? t("gtv.queue.paused") : t("gtv.queue.backoff", { s: fmt.number(wait) })}
          </p>
        )}
        {rates.length > 0 && (
          <div className="mx-4 mb-1 flex flex-col gap-2 rounded-2xl bg-surface-2 px-3 py-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("gtv.queue.api")}</div>
            {rates.map((r) => {
              const hot = r.limitedAt && Date.now() - r.limitedAt < 10 * 60000 // a 429 in the last 10 minutes
              return (
                <div key={r.id} className="flex flex-col gap-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{PROVIDERS.find((p) => p.id === r.id)?.name ?? r.id}</span>
                    {hot && <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300"><TriangleAlert className="size-3.5" />{t("gtv.queue.limited", { time: fmt.time(r.limitedAt!) })}</span>}
                    <span className="tabular-nums text-muted-foreground">{t("gtv.queue.perMin", { n: fmt.number(r.perMin) })}</span>
                    <span className="tabular-nums text-muted-foreground">{r.cap ? t("gtv.queue.todayCap", { n: fmt.number(r.today), cap: fmt.number(r.cap) }) : t("gtv.queue.today", { n: fmt.number(r.today) })}</span>
                  </div>
                  {r.cap && <div dir="ltr" className="h-1 overflow-hidden rounded-full bg-[var(--fg-10)]"><div className={cn("h-full rounded-full", r.today >= r.cap * 0.9 ? "bg-amber-500" : "bg-foreground/60")} style={{ width: `${Math.min(100, (r.today / r.cap) * 100)}%` }} /></div>}
                </div>
              )
            })}
          </div>
        )}
        <div data-nav-group className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {!now.length && !waiting.length && !unmatched.length && <p className="px-3 py-6 text-center text-muted-foreground">{t("gtv.queue.empty")}</p>}
          {now.length > 0 && <>{head(t("gtv.queue.now"))}{now.map((i) => row(i, <RefreshCw className="size-4 shrink-0 animate-spin text-muted-foreground" />))}</>}
          {waiting.length > 0 && (
            <>
              {head(t("gtv.queue.waiting"), waiting.length)}
              {waiting.slice(0, MAX_WAITING).map((i) => row(i, <Clock className="size-4 shrink-0 text-muted-foreground" />))}
              {waiting.length > MAX_WAITING && <p className="px-3 py-2 text-sm text-muted-foreground">{fmt.plural("gtv.queue.more", waiting.length - MAX_WAITING)}</p>}
            </>
          )}
          {unmatched.length > 0 && (
            <>
              <div className="flex items-center gap-2 pe-1">
                <div className="min-w-0 flex-1">{head(t("gtv.queue.unmatched"), unmatched.length)}</div>
                <button data-nav data-pill onClick={() => void retryUnmatched()} className="mt-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-[var(--fg-10)]">{t("gtv.queue.retry")}</button>
              </div>
              <p className="px-3 pb-1 text-xs text-muted-foreground">{t(hasTmdb ? "gtv.queue.unmatched.desc" : "gtv.queue.unmatched.noKey")}</p>
              {unmatched.slice(0, MAX_WAITING).map((u) => row(u.item, <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium">{t(hasTmdb ? "gtv.queue.match" : "gtv.queue.open")}</span>, u.k, match))}
              {unmatched.length > MAX_WAITING && <p className="px-3 py-2 text-sm text-muted-foreground">{fmt.plural("gtv.queue.more", unmatched.length - MAX_WAITING)}</p>}
            </>
          )}
          {recent.length > 0 && (
            <>
              {head(t("gtv.queue.done"))}
              {recent.map((r, n) => row(r.item, r.poster
                ? <Check aria-label={t("gtv.queue.found")} className="size-4 shrink-0 text-emerald-500" />
                : <ImageOff aria-label={t("gtv.queue.none")} className="size-4 shrink-0 text-muted-foreground" />, `${r.item.id}:${n}`))}
            </>
          )}
        </div>
        <div className="border-t border-[var(--fg-10)] p-3">
          <Pill className="w-full" onClick={() => { close(); openSection("metadata") }}><Settings />{t("gtv.queue.settings")}</Pill>
        </div>
      </div>
    </div>
  )
}
