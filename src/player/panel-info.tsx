import { useEffect, useState } from "react"
import { Clapperboard, Info } from "lucide-react"
import { SkelBar } from "@/components/gtv"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail } from "@/layouts/hooks/use-detail"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { useSourceOf } from "@/lib/sources"
import { useApp } from "@/lib/store"
import { connInfo } from "@/lib/xtream"
import type { Item } from "@/lib/types"
import { useSeriesOf } from "./panel"
import { useProgramme } from "./programme"
import { qualityMetrics, qualitySummary, type Stats } from "./stats"
import { Chip, Group, Tag } from "./ui"
import type { P } from "./use-player"

const KEYS: [string, string][] = [
  ["Space", "player.help.playPause"], ["← →", "player.help.seek"], ["↑ ↓", "player.help.volume"], ["M", "player.help.mute"], ["F", "player.help.fullscreen"],
  ["P", "player.help.pip"], ["S", "player.av"], ["C", "player.channels"], ["0-9", "player.help.channel"], ["?", "player.help.help"], ["Esc", "player.help.back"],
]

/** The playback hook measures every 2 s into a ref; only this tab, while open, redraws with it. */
function useStats(ref: { current: Stats | null }) {
  const [s, setS] = useState(ref.current)
  useEffect(() => { const id = setInterval(() => setS(ref.current), 2000); return () => clearInterval(id) }, [ref])
  return s
}

/** About what is playing (programme / overview, cast), how it plays (connection, the copy's facts), and, on a keyboard, the shortcuts. */
export function InfoTab({ p }: { p: P }) {
  const t = useT()
  const stats = useStats(p.E.statsRef)
  return (
    <div className="pl-grid" data-split>
      <div className="min-w-0">{p.live ? <LiveInfo item={p.item} /> : <TitleInfo p={p} />}</div>
      <div className="flex min-w-0 flex-col gap-6">
        <Group title={t("player.info")}>
          {stats ? (
            <div className="flex flex-col gap-1">
              {qualitySummary(stats, t).map((l) => <div key={l} className="font-medium">{l}</div>)}
              {qualityMetrics(stats).map((l, i) => <div key={i} className="pl-note">{l}</div>)}
            </div>
          ) : <p className="pl-note">{t("player.infoUnavailable")}</p>}
          <Conns item={p.item} />
        </Group>
        {!isTv && (
          <Group title={t("player.help.title")}>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[length:var(--pl-fs-s)]">
              {KEYS.filter(([k]) => p.live || !["0-9", "C"].includes(k)).map(([k, key]) => (
                <div key={k} className="contents">
                  <dt dir="ltr" className="pl-kbd">{k}</dt>
                  <dd className="text-[var(--pl-fg-2)]">{t(key === "player.help.volume" && p.live ? "player.help.channelUpDown" : key)}</dd>
                </div>
              ))}
            </dl>
          </Group>
        )}
      </div>
    </div>
  )
}

/** Live: now / next with their descriptions. */
function LiveInfo({ item }: { item: Item }) {
  const t = useT()
  const { current, next, pct } = useProgramme(item)
  if (!current && !next) return <Group title={item.name}><p className="pl-note">{t("player.noGuide")}</p></Group>
  return (
    <div className="flex flex-col gap-6">
      {current && (
        <Group title={t("player.more.programme")}>
          <div className="flex items-baseline gap-3"><span dir="auto" className="min-w-0 flex-1 text-[length:var(--pl-fs-l)] font-medium">{current.title}</span><span dir="ltr" className="pl-time shrink-0 text-end">{fmt.time(current.start)} - {fmt.time(current.end)}</span></div>
          <span dir="ltr" className="pl-track mt-2"><span className="pl-fill" style={{ transform: `scaleX(${pct / 100})` }} /></span>
          {current.plot && <p dir="auto" className="pl-text mt-3">{current.plot}</p>}
        </Group>
      )}
      {next && (
        <Group title={t("player.more.nextProgramme")}>
          <div className="flex items-baseline gap-3"><span dir="auto" className="min-w-0 flex-1 text-[length:var(--pl-fs-l)] font-medium">{next.title}</span><span dir="ltr" className="pl-time shrink-0 text-end">{fmt.time(next.start)} - {fmt.time(next.end)}</span></div>
          {next.plot && <p dir="auto" className="pl-text mt-2 text-[var(--pl-fg-2)]">{next.plot}</p>}
        </Group>
      )}
    </div>
  )
}

/** Movie / episode: facts, plot (the episode's own first), director, Full details + Trailer, then the cast (a name opens the person). */
function TitleInfo({ p }: { p: P }) {
  const t = useT()
  const series = useSeriesOf(p.item)
  const id = p.episode ? series?.id ?? "" : p.item.id
  const D = useDetail(id)
  const plot = (p.episode && p.item.plot) || D.plot || p.item.plot
  const facts = [...D.chips, ...D.ratings.map((r) => `${D.ratingName(r.source)} ${r.value}`)].filter(Boolean)
  return (
    <div className="flex flex-col gap-6">
      <Group title={t("player.more.overview")}>
        {facts.length > 0 && <div className="pl-wrap mb-3">{facts.map((f) => <Tag key={f}>{f}</Tag>)}</div>}
        {plot ? <p dir="auto" className="pl-text">{plot}</p> : D.loading ? <div className="space-y-2"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div> : <p className="pl-note">{t("player.more.noInfo")}</p>}
        {D.directors.length > 0 && <p dir="auto" className="pl-meta mt-3 !block"><span className="text-[var(--pl-fg-3)]">{t("player.more.director")}: </span>{D.directors.join(", ")}</p>}
        <div data-nav-group className="pl-wrap mt-4">
          {id && <Chip icon={<Info />} onClick={() => p.details(id)}>{t("player.more.details")}</Chip>}
          {D.trailer && <Chip icon={<Clapperboard />} onClick={() => { p.pause(); openTrailer(D.trailer!) }}>{t("player.more.trailer")}</Chip>}
        </div>
      </Group>
      {D.cast.length > 0 && (
        <Group title={t("player.more.cast")}>
          <div data-nav-group className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {D.cast.slice(0, 16).map((c) => (
              <button key={c.name} data-nav onClick={() => p.person(c)} className="flex w-24 shrink-0 flex-col items-center rounded-[var(--pl-r-sm)] p-1 text-center">
                {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="pl-face" /> : <span className="pl-face">{c.name.slice(0, 1)}</span>}
                <span dir="auto" className="pl-trunc mt-1.5 w-full text-[length:var(--pl-fs-s)]">{c.name}</span>
                {c.role && <span dir="auto" className="pl-trunc w-full text-[length:var(--pl-fs-xs)] text-[var(--pl-fg-3)]">{c.role}</span>}
              </button>
            ))}
          </div>
        </Group>
      )}
    </div>
  )
}

/** Xtream: connections in use / allowed (this stream included); nothing when the server won't say. */
function Conns({ item }: { item: Item }) {
  const t = useT()
  const src = useSourceOf(item)
  const proxy = useApp((s) => s.settings.proxy)
  const [c, setC] = useState<{ act: number; max: number } | null>(null)
  useEffect(() => { if (src?.type === "xtream") void connInfo(src, proxy).then(setC) }, [src?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return c ? <div className="mt-3"><Tag>{t("player.more.conns", { used: fmt.number(c.act), max: fmt.number(c.max) })}</Tag></div> : null
}
