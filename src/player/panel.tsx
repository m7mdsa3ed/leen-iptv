import { useEffect, useMemo, useRef } from "react"
import { Cast, Clock, LayoutGrid, PictureInPicture2, Star } from "lucide-react"
import { SkelBar } from "@/components/gtv"
import { useDetail } from "@/layouts/hooks/use-detail"
import { useCatalog } from "@/lib/catalog"
import { castSupported } from "@/lib/cast"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { srcOfId } from "@/lib/merge-pure"
import { STREAM_QS } from "@/lib/quality"
import type { Item } from "@/lib/types"
import { AvTab } from "./panel-av"
import { InfoTab } from "./panel-info"
import { FITS, SLEEP_MIN, SPEEDS } from "./prefs"
import { Chip, Choices, Group, Row, Sheet, Tag } from "./ui"
import type { P, Tab } from "./use-player"
import { speedLabel } from "./util"

/* ---------- the panel ---------- */

/**
 * The one panel for everything that is not the video: Episodes (episodes), Audio & subtitles, Playback, Info. A sheet from the bottom
 * over the dimmed, still playing video; tabs on top. Focus starts on the open tab; on TV moving onto a tab opens it, Up from the tabs
 * or Back closes the panel (use-keys), a swipe down on the tabs too. [data-modal] keeps the D-pad inside.
 */
export function Panel({ p }: { p: P }) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
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
    <Sheet side="bottom" label={t("player.tab.options")} onClose={p.closeLayer} sref={ref}
      head={
        <div data-tabs data-nav-group role="tablist" className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map(([k, label]) => <Chip key={k} role="tab" ghost on={k === cur} aria-selected={k === cur} onClick={() => p.setTab(k)} onFocus={() => isTv && p.setTab(k)}>{label}</Chip>)}
        </div>
      }>
      <div key={cur} role="tabpanel" className="pl-sheet-body no-scrollbar m-fade">
        {cur === "episodes" && <EpisodesTab p={p} />}
        {cur === "av" && <AvTab p={p} />}
        {cur === "playback" && <PlaybackTab p={p} />}
        {cur === "info" && <InfoTab p={p} />}
      </div>
    </Sheet>
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
  useEffect(() => { requestAnimationFrame(() => document.querySelector<HTMLElement>(".pl-sheet [data-ep][data-cur]")?.scrollIntoView({ block: "nearest" })) }, [D.season, D.shown.length])
  if (!D.episodes.length) return D.loading || !series ? <div className="pl-list">{[0, 1, 2].map((i) => <SkelBar key={i} className="h-20 w-full" />)}</div> : <p className="pl-note">{t("gtv.detail.noEpisodes")}</p>
  const queue = D.episodes.map((e) => e.item)
  return (
    <>
      {D.seasons.length > 1 && <div className="mb-4"><Choices items={D.seasons} value={D.season ?? D.seasons[0]} onPick={D.setSeason} label={(n) => t("player.more.season", { n })} /></div>}
      <div data-nav-group className="pl-list">
        {D.shown.filter((e) => !e.missing).map((e) => {
          const cur = e.item.id === p.item.id
          const pct = D.pct(e.item)
          return (
            <Row key={e.id} data-ep="" data-cur={cur ? "" : undefined} on={cur} onClick={() => { if (!cur) p.playItem(e.item, queue); p.closeLayer() }}
              lead={
                <span className="pl-thumb">
                  {e.item.logo && <img src={e.item.logo} alt="" loading="lazy" decoding="async" />}
                  {pct > 0 && <span dir="ltr" className="pl-track"><span className="pl-fill" style={{ transform: `scaleX(${pct / 100})` }} /></span>}
                </span>
              }
              label={<><bdi className="me-2 opacity-60">{fmt.number(e.num)}</bdi>{e.title}</>}
              detail={[D.epDur(e.dur), D.watched(e.item) ? t("hooks.detail.watched") : ""].filter(Boolean).join("  ·  ") || undefined}
              trail={cur ? <Tag>{t("player.more.playing")}</Tag> : null} />
          )
        })}
      </div>
    </>
  )
}

/* ---------- Playback ---------- */

/** Picture, speed, quality, version, sleep timer, auto-play and the screen actions, each a row of pills. */
function PlaybackTab({ p }: { p: P }) {
  const t = useT()
  return (
    <div className="pl-grid">
      {p.S.mediaServer && !p.live && <Group title={t("player.quality")}><Choices items={STREAM_QS.map((q) => q.id)} value={p.q.id} onPick={(id) => p.setQuality(STREAM_QS.find((q) => q.id === id)!)} label={(id) => (id === "original" ? t("player.original") : STREAM_QS.find((q) => q.id === id)!.label)} /></Group>}
      {!p.live && <Group title={t("player.speed")}><Choices items={[...SPEEDS]} value={p.speed} onPick={p.setSpeed} label={(n) => <bdi dir="ltr">{speedLabel(n)}</bdi>} /></Group>}
      <Group title={t("player.aspect")}><Choices items={FITS.map((_, i) => i)} value={p.fit} onPick={p.setFit} label={(i) => t(`player.fit.${FITS[i]}`)} /></Group>
      <Group title={t("player.clock.title")}>
        <div data-nav-group className="pl-wrap">
          <Chip aria-pressed={p.clock} on={p.clock} icon={<Clock />} onClick={() => p.setClock(true)}>{t("player.on")}</Chip>
          <Chip aria-pressed={!p.clock} on={!p.clock} icon={<Clock />} onClick={() => p.setClock(false)}>{t("player.off")}</Chip>
        </div>
      </Group>
      <Group title={t("player.sleep.title")}><Choices items={[0, ...SLEEP_MIN]} value={p.sleepMin} onPick={p.setSleep} label={(n) => (n ? t("player.sleep.min", { n }) : t("player.off"))} /></Group>
      {p.variants.length > 1 && (
        <Group title={t("player.variant")}>
          <div data-nav-group className="pl-list">{p.variants.map((v) => <Row key={v.item.id} on={v.item.id === p.item.id} onClick={() => p.pickVariant(v.item)} label={v.item.name} detail={v.src} />)}</div>
        </Group>
      )}
      {p.episode && p.autoAll && (
        <Group title={t("player.nextEpisode")}>
          <div data-nav-group className="pl-wrap"><Chip aria-pressed={!p.autoNext} on={!p.autoNext} onClick={p.toggleShowAuto}>{p.autoNext ? t("player.autoOffBtn") : t("player.autoOnShow")}</Chip></div>
        </Group>
      )}
      <Group title={t("player.tab.more")}>
        <div data-nav-group className="pl-wrap">
          <Chip aria-pressed={p.isFav} on={p.isFav} icon={<Star className={p.isFav ? "fill-current" : ""} />} onClick={p.toggleFav}>{t(p.isFav ? "player.more.removeFav" : "player.more.addFav")}</Chip>
          {p.canPip && <Chip aria-pressed={p.pip} on={p.pip} icon={<PictureInPicture2 />} onClick={() => { p.togglePip(); p.closeLayer() }}>{t("player.pip")}</Chip>}
          {castSupported() && <Chip aria-pressed={p.casting} on={p.casting} icon={<Cast />} onClick={() => void p.cast()}>{t("player.cast")}</Chip>}
          {p.live && <Chip icon={<LayoutGrid />} onClick={p.multi}>{t("player.multi")}</Chip>}
        </div>
      </Group>
    </div>
  )
}
