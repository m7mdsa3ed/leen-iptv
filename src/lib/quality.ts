export type Quality = "good" | "fair" | "poor"

/** Rate a stream from what the player can measure. bw/bitrate in bps (optional: only HLS/MPEG-TS expose them). */
export function rate(s: { bufAhead: number; stalls: number; bw?: number; bitrate?: number }): Quality {
  const ratio = s.bw && s.bitrate ? s.bw / s.bitrate : Infinity // download speed vs what the stream needs
  if (s.stalls >= 3 || ratio < 1.1 || s.bufAhead < 1) return "poor"
  if (s.stalls >= 1 || ratio < 1.5 || s.bufAhead < 4) return "fair"
  return "good"
}

/** Media-server (Plex/Jellyfin) stream quality picked in the player. Original = no caps; the server copies the source when it can. */
export type StreamQ = { id: "original" | "1080" | "720" | "480"; label: string; height?: number; kbps?: number }
export const STREAM_QS: StreamQ[] = [
  { id: "original", label: "Original" },
  { id: "1080", label: "1080p - 20 Mbps", height: 1080, kbps: 20000 },
  { id: "720", label: "720p - 8 Mbps", height: 720, kbps: 8000 },
  { id: "480", label: "480p - 3 Mbps", height: 480, kbps: 3000 },
]

const canPlay = (c: string, kind = "video") => { try { return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(`${kind}/mp4; codecs="${c}"`) } catch { return false } }
/** Video codecs this device decodes over MSE (webOS: usually hevc; desktop Chrome 94: h264 only). */
export const VIDEO_CODECS = ["h264", ...(canPlay("hvc1.1.6.L150.B0") ? ["hevc"] : []), ...(canPlay("av01.0.08M.08") ? ["av1"] : [])]
/** Audio codecs passed through untouched (webOS: usually ac3 + eac3; desktop Chrome: aac only). aac first = the transcode target. */
export const AUDIO_CODECS = ["aac", ...(canPlay("ac-3", "audio") ? ["ac3"] : []), ...(canPlay("ec-3", "audio") ? ["eac3"] : [])]
