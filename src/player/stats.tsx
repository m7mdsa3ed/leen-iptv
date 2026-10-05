import { fmt, t as tn } from "@/lib/i18n"
import type { Quality } from "@/lib/quality"

export type Stats = { q: Quality; bw?: number; bitrate?: number; height?: number; buf: number; dropped: number; stalls: number; audio?: string }

/** "mp4a.40.2" + 6 ch -> "AAC 5.1", "ec-3" -> "EAC3". Unknown codecs show their raw id. */
export function audioLabel({ codec, ch }: { codec?: string; ch?: number }) {
  if (!codec) return undefined
  const c = codec.toLowerCase()
  const name = c === "ac-3" ? "AC3" : c === "ec-3" ? "EAC3" : c === "opus" ? "Opus" : c === "mp3" || c === "mp4a.40.34" || c === "mp4a.6b" ? "MP3" : c.startsWith("mp4a") ? "AAC" : c.split(".")[0].toUpperCase()
  return name + (ch === 1 ? ` ${tn("player.mono")}` : ch === 2 ? ` ${tn("player.stereo")}` : ch ? ` ${ch - 1}.1` : "")
}
const mbps = (n: number | undefined, key: string) => (n ? tn(key, { n: +(n / 1e6).toFixed(1) }) : "")

export function qualitySummary(s: Stats, t: (key: string) => string) {
  return [
    `${t("player.quality")}: ${t(`player.q.${s.q}`)}`,
    ...(s.height ? [`${t("player.more.resolution")}: ${s.height}p`] : []),
    ...(s.audio ? [`${t("player.more.audio")}: ${s.audio}`] : []),
  ]
}

export function qualityMetrics(s: Stats) {
  return [
    mbps(s.bw, "player.stat.link"),
    mbps(s.bitrate, "player.stat.stream"),
    tn("player.stat.buffered", { n: Math.round(s.buf) }),
    s.stalls ? fmt.plural("player.stat.stalls", s.stalls) : "",
    s.dropped >= 1 ? tn("player.stat.dropped", { n: Math.round(s.dropped) }) : "",
  ].filter(Boolean)
}
