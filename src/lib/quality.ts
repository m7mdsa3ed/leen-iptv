export type Quality = "good" | "fair" | "poor"

/** Rate a stream from what the player can measure. bw/bitrate in bps (optional: only HLS/MPEG-TS expose them). */
export function rate(s: { bufAhead: number; stalls: number; bw?: number; bitrate?: number }): Quality {
  const ratio = s.bw && s.bitrate ? s.bw / s.bitrate : Infinity // download speed vs what the stream needs
  if (s.stalls >= 3 || ratio < 1.1 || s.bufAhead < 1) return "poor"
  if (s.stalls >= 1 || ratio < 1.5 || s.bufAhead < 4) return "fair"
  return "good"
}
