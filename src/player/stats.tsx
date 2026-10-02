import { fmt, t as tn, useT } from "@/lib/i18n"
import type { Quality } from "@/lib/quality"

export type Stats = { q: Quality; bw?: number; bitrate?: number; height?: number; buf: number; dropped: number; stalls: number; audio?: string }

const QC = { good: "bg-emerald-400", fair: "bg-amber-400", poor: "bg-red-500" } as const

/** "mp4a.40.2" + 6 ch -> "AAC 5.1", "ec-3" -> "EAC3". Unknown codecs show their raw id. */
export function audioLabel({ codec, ch }: { codec?: string; ch?: number }) {
  if (!codec) return undefined
  const c = codec.toLowerCase()
  const name = c === "ac-3" ? "AC3" : c === "ec-3" ? "EAC3" : c === "opus" ? "Opus" : c === "mp3" || c === "mp4a.40.34" || c === "mp4a.6b" ? "MP3" : c.startsWith("mp4a") ? "AAC" : c.split(".")[0].toUpperCase()
  return name + (ch === 1 ? ` ${tn("player.mono")}` : ch === 2 ? ` ${tn("player.stereo")}` : ch ? ` ${ch - 1}.1` : "")
}
const mbps = (n: number | undefined, key: string) => (n ? tn(key, { n: +(n / 1e6).toFixed(1) }) : "")

/** The numbers behind the rating, shown above the controls while they are open. */
export const qualityDetail = (s: Stats) =>
  [mbps(s.bw, "player.stat.link"), mbps(s.bitrate, "player.stat.stream"), tn("player.stat.buffered", { n: Math.round(s.buf) }), s.stalls ? fmt.plural("player.stat.stalls", s.stalls) : "", s.dropped >= 1 ? tn("player.stat.dropped", { n: Math.round(s.dropped) }) : ""].filter(Boolean).join(" · ")

/** Three signal bars + label, the third zone of the control row. */
export function QualityBadge({ s }: { s: Stats }) {
  const t = useT()
  const ql = t(`player.q.${s.q}`)
  const on = s.q === "good" ? 3 : s.q === "fair" ? 2 : 1
  return (
    <div dir="ltr" data-ltr className="pl-badge flex h-[var(--pl-h)] shrink-0 items-center gap-2 rounded-full px-4 text-sm sm:text-base" title={qualityDetail(s)} aria-label={t("player.q.label", { q: ql })}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => <span key={n} className={`w-1.5 rounded-sm ${n <= on ? QC[s.q] : "bg-white/25"}`} style={{ height: 6 + n * 4 }} />)}
      </span>
      <span>{ql}</span>
      {s.height ? <span className="text-white/60">{s.height}p</span> : null}
      {s.audio ? <span className="text-white/60">{s.audio}</span> : null}
    </div>
  )
}
