import { cn } from "@/lib/utils"
import type { Source } from "@/lib/types"

// ponytail: simple-icons paths (Plex chevron, Jellyfin jellyfish), one path each, no asset files
const PATHS: Partial<Record<Source["type"], string>> = {
  plex: "M11.643 0H4.68l7.679 12L4.68 24h6.963l7.677-12-7.677-12",
  jellyfin: "M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.68 0C25.38 18.573 15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189.518 1.04 7.348 1.027 7.86 0 .511-1.027-2.874-7.19-3.93-7.19z",
}

/** True when the type has its own logo (Plex, Jellyfin); Xtream and M3U keep the word/dot. */
export const hasMark = (type: Source["type"]) => !!PATHS[type]

/** Plex/Jellyfin logo in `color` (default: the surrounding text color); any other type = the small colored dot. */
export function SourceMark({ type, color, className }: { type: Source["type"]; color?: string; className?: string }) {
  const d = PATHS[type]
  if (!d) return <span aria-hidden style={{ background: color }} className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} />
  return <svg aria-hidden viewBox="0 0 24 24" fill={color ?? "currentColor"} className={cn("inline-block size-4 shrink-0", className)}><path d={d} /></svg>
}
