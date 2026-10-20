import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { Check, X } from "lucide-react"
import { Pill, RoundButton, SkelBar } from "@/components/gtv"
import { useDetail } from "@/layouts/hooks/use-detail"
import { useCatalog } from "@/lib/catalog"
import { castSupported } from "@/lib/cast"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { srcOfId } from "@/lib/merge-pure"
import { STREAM_QS } from "@/lib/quality"
import { cn } from "@/lib/utils"
import type { Item } from "@/lib/types"
import { AvTab } from "./panel-av"
import { InfoTab } from "./panel-info"
import { FITS, SLEEP_MIN, SPEEDS } from "./prefs"
import type { P, Tab } from "./use-player"
import { speedLabel } from "./util"

/* ---------- shared bits of every tab ---------- */

/** A titled block inside a tab. */
export const Group = ({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn("pl-group", className)}>
    <h3 className="pl-h3">{title}</h3>
    {children}
  </section>
)
/** One row of choices (a pill each), the picked one filled. A row is one line for the D-pad. */
export function Choices<T extends string | number>({ items, value, onPick, label }: { items: T[]; value: T; onPick: (v: T) => void; label: (v: T) => ReactNode }) {
  return (
    <div data-nav-group className="flex flex-wrap gap-2">
      {items.map((v) => <Pill key={String(v)} aria-pressed={v === value} variant={v === value ? "primary" : "tonal"} className="pl-pill" onClick={() => onPick(v)}>{label(v)}</Pill>)}
    </div>
  )
}
/** A selectable row in a vertical list (tracks, versions): label, an optional second line, a check when picked. */
export function Row({ on, onClick, label, detail, cur }: { on: boolean; onClick: () => void; label: ReactNode; detail?: ReactNode; cur?: boolean }) {
  return (
    <button data-nav role="menuitemradio" aria-checked={on} data-cur={cur ? "" : undefined} onClick={onClick} className={cn("pl-row-btn flex w-full items-center gap-3 text-start", on && "pl-row-on")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi dir="auto" className="truncate">{label}</bdi>
        {detail && <span className="truncate text-sm opacity-60">{detail}</span>}
      </span>
      {on && <Check className="size-5 shrink-0" />}
    </button>
  )
}

/* ---------- the panel ---------- */

/**
 * The one panel for everything that is not the video: Episodes (episodes), Audio & subtitles, Playback, Info. A sheet from the bottom
 * over the dimmed, still playing video; tabs on top. Focus starts on the open tab; on TV moving onto a tab opens it, Up from the tabs
 * or Back closes the panel (use-keys), a swipe down on the tabs too. [data-modal] keeps the D-pad inside.
 */
export function Panel({ p }: { p: P }) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const swipe = useRef<number | null>(null)
  const tabs = ([
    ["episodes", t("player.more.episodes"), p.episode],
    ["av", t("player.av"), true],
    ["playback", t("player.tab.playback"), true],
    ["info", t("player.tab.info"), true],
  ] as [Tab, string, boolean][]).filter(([, , on]) => on)
  const cur = tabs.some(([k]) => k === p.tab) ? p.tab : tabs[0][0]
  useEffect(() => {
    const id = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>("[data-tabs] [aria-selected=true]")?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <>
      <div aria-hidden className="absolute inset-0 z-[9] bg-black/50 m-fade" onClick={p.closeLayer} />
      <section ref={ref} data-modal role="dialog" aria-label={t("player.tab.options")} className="pl-panel m-rise absolute inset-x-0 bottom-0 z-10 flex flex-col">
        <div data-tabs data-nav-group role="tablist" className="pl-tabs no-scrollbar"
          onTouchStart={(e) => (swipe.current = e.touches[0].clientY)}
          onTouchEnd={(e) => { if (swipe.current !== null && e.changedTouches[0].clientY - swipe.current > 70) p.closeLayer(); swipe.current = null }}>
          {tabs.map(([k, label]) => (
            <button key={k} data-nav data-pill role="tab" aria-selected={k === cur} onClick={() => p.setTab(k)} onFocus={() => isTv && p.setTab(k)} className={cn("pl-tab", k === cur && "pl-tab-on")}>{label}</button>
          ))}
          {!isTv && <RoundButton label={t("player.close")} onClick={p.closeLayer} className="pl-rb ms-auto shrink-0"><X /></RoundButton>}
        </div>
        <div key={cur} role="tabpanel" className="pl-body no-scrollbar m-fade min-h-0 flex-1 overflow-y-auto">
          {cur === "episodes" && <EpisodesTab p={p} />}
          {cur === "av" && <AvTab p={p} />}
          {cur === "playback" && <PlaybackTab p={p} />}
          {cur === "info" && <InfoTab p={p} />}
        </div>
      </section>
    </>
  )
}

/* ---------- Episodes ---------- */

/** The series an episode belongs to (episodes are named by their series and live in the same source). */
export function useSeriesOf(item: Item) {
  const byId = useCatalog((s) => s.byId)
  return useMemo(() => {
    if (item.series) { const s = byId.get(item.series); if (s) return s }
    for (const i of byId.values()) if (i.kind === "series" && i.name === item.group && srcOfId(i.id) === srcOfId(item.id)) return i
    return undefined
  }, [byId, item.id, item.series, item.group])
}

/** Season pills over the season's episodes (the playing one marked); picking one plays it with the rest of the show queued after it. */
function EpisodesTab({ p }: { p: P }) {
  const t = useT()
  const series = useSeriesOf(p.item)
  const D = useDetail(series?.id ?? "")
  const here = D.episodes.find((e) => e.item.id === p.item.id)
  const set = useRef(false)
  useEffect(() => { if (here && !set.current) { set.current = true; if (D.season !== here.season) D.setSeason(here.season) } }, [here, D.season]) // eslint-disable-line react-hooks/exhaustive-deps
  // the playing episode in view once the list is there
  useEffect(() => { requestAnimationFrame(() => document.querySelector<HTMLElement>(".pl-panel [data-ep][data-cur]")?.scrollIntoView({ block: "nearest" })) }, [D.season, D.shown.length])
  if (!D.episodes.length) return D.loading || !series ? <div className="space-y-3">{[0, 1, 2].map((i) => <SkelBar key={i} className="h-20 w-full" />)}</div> : <p className="opacity-60">{t("gtv.detail.noEpisodes")}</p>
  const queue = D.episodes.map((e) => e.item)
  return (
    <>
      {D.seasons.length > 1 && <div className="mb-4"><Choices items={D.seasons} value={D.season ?? D.seasons[0]} onPick={D.setSeason} label={(n) => t("player.more.season", { n })} /></div>}
      <div data-nav-group className="flex flex-col gap-1.5">
        {D.shown.map((e) => {
          const cur = e.item.id === p.item.id
          const pct = D.pct(e.item)
          return (
            <button key={e.id} data-nav data-ep data-cur={cur ? "" : undefined} onClick={() => { if (!cur) p.playItem(e.item, queue); p.closeLayer() }}
              className={cn("pl-row-btn flex w-full items-center gap-4 text-start", cur && "pl-row-on")}>
              <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-white/10 sm:w-40">
                {e.item.logo && <img src={e.item.logo} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
                {pct > 0 && <span dir="ltr" className="absolute inset-x-0 bottom-0 h-1 bg-white/25"><span className="block h-full bg-[var(--plex)]" style={{ width: `${pct}%` }} /></span>}
              </span>
              <span className="min-w-0 flex-1">
                {cur && <span className="pl-live mb-1 inline-block">{t("player.more.playing")}</span>}
                <span dir="auto" className="block truncate text-lg"><bdi className="me-2 opacity-60">{fmt.number(e.num)}</bdi>{e.title}</span>
                <span className="block truncate text-sm opacity-60">{[D.epDur(e.dur), D.watched(e.item) ? t("hooks.detail.watched") : ""].filter(Boolean).join("  ·  ")}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

/* ---------- Playback ---------- */

/** Picture, speed, quality, version, sleep timer, auto-play, skip marks and the screen actions, each a row of pills. */
function PlaybackTab({ p }: { p: P }) {
  const t = useT()
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      {p.S.mediaServer && !p.live && <Group title={t("player.quality")}><Choices items={STREAM_QS.map((q) => q.id)} value={p.q.id} onPick={(id) => p.setQuality(STREAM_QS.find((q) => q.id === id)!)} label={(id) => (id === "original" ? t("player.original") : STREAM_QS.find((q) => q.id === id)!.label)} /></Group>}
      {!p.live && <Group title={t("player.speed")}><Choices items={[...SPEEDS]} value={p.speed} onPick={p.setSpeed} label={(n) => <bdi dir="ltr">{speedLabel(n)}</bdi>} /></Group>}
      <Group title={t("player.aspect")}><Choices items={FITS.map((_, i) => i)} value={p.fit} onPick={p.setFit} label={(i) => t(`player.fit.${FITS[i]}`)} /></Group>
      <Group title={t("player.sleep.title")}><Choices items={[0, ...SLEEP_MIN]} value={p.sleepMin} onPick={p.setSleep} label={(n) => (n ? t("player.sleep.min", { n }) : t("player.off"))} /></Group>
      {p.variants.length > 1 && (
        <Group title={t("player.variant")}>
          <div data-nav-group className="flex flex-col gap-1">{p.variants.map((v) => <Row key={v.item.id} on={v.item.id === p.item.id} onClick={() => p.pickVariant(v.item)} label={v.item.name} detail={v.src} />)}</div>
        </Group>
      )}
      {p.episode && p.autoAll && (
        <Group title={t("player.nextEpisode")}>
          <div data-nav-group className="flex flex-wrap gap-2"><Pill aria-pressed={!p.autoNext} variant={p.autoNext ? "tonal" : "primary"} className="pl-pill" onClick={p.toggleShowAuto}>{p.autoNext ? t("player.autoOffBtn") : t("player.autoOnShow")}</Pill></div>
        </Group>
      )}
      {p.episode && (
        <Group title={t("player.mark.title")}>
          <div data-nav-group className="flex flex-wrap gap-2">
            {(["is", "ie", "ce"] as const).map((k) => <Pill key={k} className="pl-pill" onClick={() => p.mark(k)}>{t(`player.mark.${k}`)}</Pill>)}
            {p.hasMarks && <Pill className="pl-pill" onClick={() => p.mark("reset")}>{t("player.mark.reset")}</Pill>}
          </div>
        </Group>
      )}
      <Group title={t("player.tab.more")}>
        <div data-nav-group className="flex flex-wrap gap-2">
          <Pill aria-pressed={p.isFav} variant={p.isFav ? "primary" : "tonal"} className="pl-pill" onClick={p.toggleFav}>{t(p.isFav ? "player.more.removeFav" : "player.more.addFav")}</Pill>
          {p.canPip && <Pill aria-pressed={p.pip} className="pl-pill" onClick={() => { p.togglePip(); p.closeLayer() }}>{t("player.pip")}</Pill>}
          {castSupported() && <Pill aria-pressed={p.casting} className="pl-pill" onClick={() => void p.cast()}>{t("player.cast")}</Pill>}
          {p.live && !isTv && <Pill className="pl-pill" onClick={p.multi}>{t("player.multi")}</Pill>}
        </div>
      </Group>
    </div>
  )
}
