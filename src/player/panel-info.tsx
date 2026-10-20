import { useEffect, useState } from "react"
import { Clapperboard, Info } from "lucide-react"
import { Pill, SkelBar } from "@/components/gtv"
import { openTrailer } from "@/components/TrailerModal"
import { useDetail } from "@/layouts/hooks/use-detail"
import { isTv } from "@/lib/device"
import { fmt, useT } from "@/lib/i18n"
import { useSourceOf } from "@/lib/sources"
import { useApp } from "@/lib/store"
import { connInfo } from "@/lib/xtream"
import type { Item } from "@/lib/types"
import { Group, useSeriesOf } from "./panel"
import { useProgramme } from "./programme"
import { qualityMetrics, qualitySummary } from "./stats"
import type { P } from "./use-player"

const KEYS: [string, string][] = [
  ["Space", "player.help.playPause"], ["← →", "player.help.seek"], ["↑ ↓", "player.help.volume"], ["M", "player.help.mute"], ["F", "player.help.fullscreen"],
  ["P", "player.help.pip"], ["S", "player.av"], ["C", "player.channels"], ["0-9", "player.help.channel"], ["?", "player.help.help"], ["Esc", "player.help.back"],
]

/** About what is playing (programme / overview, cast), how it plays (connection, the copy's facts), and, on a keyboard, the shortcuts. */
export function InfoTab({ p }: { p: P }) {
  const t = useT()
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">{p.live ? <LiveInfo item={p.item} /> : <TitleInfo p={p} />}</div>
      <div className="flex min-w-0 flex-col gap-6">
        <Group title={t("player.info")}>
          {p.E.stats ? (
            <div className="flex flex-col gap-1">
              {qualitySummary(p.E.stats, t).map((l) => <div key={l} className="font-medium">{l}</div>)}
              {qualityMetrics(p.E.stats).map((l, i) => <div key={i} className="text-sm opacity-60">{l}</div>)}
            </div>
          ) : <p className="text-sm opacity-60">{t("player.infoUnavailable")}</p>}
          <Conns item={p.item} />
        </Group>
        {!isTv && (
          <Group title={t("player.help.title")}>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
              {KEYS.filter(([k]) => p.live || !["0-9", "C"].includes(k)).map(([k, key]) => (
                <div key={k} className="contents">
                  <dt dir="ltr" className="justify-self-start rounded-md bg-white/10 px-2 py-0.5 font-mono">{k}</dt>
                  <dd className="opacity-80">{t(key === "player.help.volume" && p.live ? "player.help.channelUpDown" : key)}</dd>
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
  if (!current && !next) return <Group title={item.name}><p className="opacity-60">{t("player.noGuide")}</p></Group>
  return (
    <div className="flex flex-col gap-6">
      {current && (
        <Group title={t("player.more.programme")}>
          <div className="flex items-baseline gap-3"><span dir="auto" className="min-w-0 flex-1 text-xl font-medium">{current.title}</span><span dir="ltr" className="shrink-0 text-sm tabular-nums opacity-60">{fmt.time(current.start)} - {fmt.time(current.end)}</span></div>
          <div dir="ltr" className="pl-prog mt-2"><span style={{ width: `${pct}%` }} /></div>
          {current.plot && <p dir="auto" className="mt-3 leading-relaxed opacity-85">{current.plot}</p>}
        </Group>
      )}
      {next && (
        <Group title={t("player.more.nextProgramme")}>
          <div className="flex items-baseline gap-3"><span dir="auto" className="min-w-0 flex-1 text-lg">{next.title}</span><span dir="ltr" className="shrink-0 text-sm tabular-nums opacity-60">{fmt.time(next.start)} - {fmt.time(next.end)}</span></div>
          {next.plot && <p dir="auto" className="mt-2 text-sm leading-relaxed opacity-70">{next.plot}</p>}
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
        {facts.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{facts.map((f) => <span key={f} className="pl-tag"><bdi>{f}</bdi></span>)}</div>}
        {plot ? <p dir="auto" className="leading-relaxed opacity-90">{plot}</p> : D.loading ? <div className="space-y-2"><SkelBar className="w-full" /><SkelBar className="w-2/3" /></div> : <p className="opacity-60">{t("player.more.noInfo")}</p>}
        {D.directors.length > 0 && <p dir="auto" className="mt-3 text-sm"><span className="opacity-60">{t("player.more.director")}: </span>{D.directors.join(", ")}</p>}
        <div data-nav-group className="mt-4 flex flex-wrap gap-2">
          {id && <Pill className="pl-pill" onClick={() => p.details(id)}><Info />{t("player.more.details")}</Pill>}
          {D.trailer && <Pill className="pl-pill" onClick={() => { p.pause(); openTrailer(D.trailer!) }}><Clapperboard />{t("player.more.trailer")}</Pill>}
        </div>
      </Group>
      {D.cast.length > 0 && (
        <Group title={t("player.more.cast")}>
          <div data-nav-group className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {D.cast.slice(0, 16).map((c) => (
              <button key={c.name} data-nav onClick={() => p.person(c)} className="flex w-24 shrink-0 flex-col items-center rounded-2xl p-1 text-center">
                {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" className="size-20 rounded-full bg-white/10 object-cover" /> : <span className="grid size-20 place-items-center rounded-full bg-white/10 text-xl">{c.name.slice(0, 1)}</span>}
                <span dir="auto" className="mt-1.5 w-full truncate text-sm">{c.name}</span>
                {c.role && <span dir="auto" className="w-full truncate text-xs opacity-60">{c.role}</span>}
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
  return c ? <div className="mt-3"><span className="pl-tag">{t("player.more.conns", { used: fmt.number(c.act), max: fmt.number(c.max) })}</span></div> : null
}
