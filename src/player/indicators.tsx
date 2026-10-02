import { useCallback, useEffect, useRef, useState } from "react"
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react"

export type FlashKind = "play" | "pause" | "back" | "fwd" | "vol" | "mute"
type FlashState = { k: number; kind: FlashKind; text?: string } | null

/** Transient centre indicator (seek, volume, mute, play/pause). The element is removed by a timer, so it also disappears when animations are off. */
export function useFlash() {
  const [f, setF] = useState<FlashState>(null)
  const n = useRef(0)
  const tm = useRef(0)
  const fire = useCallback((kind: FlashKind, text?: string) => {
    setF({ k: ++n.current, kind, text })
    clearTimeout(tm.current)
    tm.current = window.setTimeout(() => setF(null), 800)
  }, [])
  useEffect(() => () => clearTimeout(tm.current), [])
  return [f, fire] as const
}

const ICON = { play: Play, pause: Pause, back: RotateCcw, fwd: RotateCw, mute: VolumeX, vol: Volume2 } as const

export function Flash({ f }: { f: FlashState }) {
  if (!f) return null
  const Icon = ICON[f.kind]
  // media is physical left/right (dir=ltr): seek back sits left, forward right
  const side = f.kind === "back" ? "left-[16%]" : f.kind === "fwd" ? "right-[16%]" : "left-1/2 -translate-x-1/2"
  return (
    <div key={f.k} aria-hidden className={`pointer-events-none absolute top-1/2 z-[5] -mt-12 ${side}`}>
      <div dir="ltr" data-ltr className="pl-flash flex min-w-24 flex-col items-center gap-1 rounded-[var(--pl-r)] bg-black/60 px-5 py-4 text-center">
        <Icon className={`size-9 ${f.kind === "play" || f.kind === "pause" ? "fill-current" : ""}`} />
        {f.text ? <span className="text-xl font-medium">{f.text}</span> : null}
      </div>
    </div>
  )
}

/** Centre spinner. Before the first frame it also names what is loading; later it is just the rebuffering ring. */
export function Spinner({ title, started, label }: { title: string; started: boolean; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center" role="status" aria-label={label}>
      <div className="size-16 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      {!started && <div dir="auto" className="max-w-xl truncate text-lg text-white/80">{title}</div>}
    </div>
  )
}

/** Channel number being typed with the remote / keyboard. */
export const NumberEntry = ({ n }: { n: string }) => (
  <div dir="ltr" data-ltr className="absolute end-[var(--gx)] top-[max(1rem,env(safe-area-inset-top))] z-[6] rounded-[var(--pl-r)] bg-black/70 px-6 py-3 text-3xl sm:text-5xl">{n}</div>
)
