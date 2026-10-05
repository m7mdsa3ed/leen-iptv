import { useEffect, useRef, useState } from "react"
import { create } from "zustand"
import { useRoute } from "@/lib/nav"
import { useApp } from "@/lib/store"
import type { Item } from "@/lib/types"
import Player from "@/pages/player"

type Q = { queue: Item[]; index: number }
type Box = { x: number; y: number; w: number } // mini player: top-left + width in px (height = 16:9)
type Host = {
  s: (Q & { key: number; start?: boolean }) | null // the running playback session (one Player instance per key)
  cur: Q | null // what that Player is on now (it can zap / change episode)
  canMini: boolean // playing without an error: leaving the player keeps it running small
  pip: boolean // in the browser's own picture-in-picture window: the mini box hides meanwhile
}
export const usePlayerHost = create<Host>(() => ({ s: null, cur: null, canMini: false, pip: false }))
let n = 0

/** Stop playback for good (mini close, stop key, sleep timer, last episode ended). */
export const closePlayer = () => usePlayerHost.setState({ s: null, cur: null, canMini: false, pip: false })

/** The `player` route: hands its queue to the persistent host (the same title keeps the running player, so expanding the
 *  mini player never reloads the stream). Leaving the route shrinks it to the mini player, or stops it if it never played. */
export function PlayerRoute({ queue, index, start }: Q & { start?: boolean }) {
  useEffect(() => {
    const h = usePlayerHost.getState()
    const same = h.s && !start && h.cur?.queue[h.cur.index]?.id === queue[index]?.id
    if (!same) usePlayerHost.setState({ s: { key: ++n, queue, index, start }, cur: { queue, index }, canMini: false })
    return () => { if (!usePlayerHost.getState().canMini) closePlayer() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/* mini player geometry: device-local, kept inside the window */
const KEY = "leen-mini"
const M = 12 // margin from the window edges
const minW = () => Math.min(200, window.innerWidth - 2 * M)
const maxW = () => Math.max(minW(), Math.min(720, window.innerWidth * 0.6))
const fit = (b: Box): Box => {
  const w = Math.min(maxW(), Math.max(minW(), b.w)), h = (w * 9) / 16
  return { w, x: Math.min(Math.max(M, b.x), window.innerWidth - w - M), y: Math.min(Math.max(M, b.y), window.innerHeight - h - M) }
}
const load = (): Box | null => { try { const b = JSON.parse(localStorage.getItem(KEY) ?? "null"); return b && Number.isFinite(b.x) ? b : null } catch { return null } }

/** Rendered once beside the page stack: the full-screen player while the `player` route is on top, else the mini player (unless turned off in Settings)
 *  (drag it anywhere, resize it from the grip on its inner top corner; a drag never counts as a tap). */
export function PlayerHost() {
  const s = usePlayerHost((x) => x.s)
  const pip = usePlayerHost((x) => x.pip)
  const full = useRoute((r) => r.stack[r.stack.length - 1]?.name === "player")
  const miniOn = useApp((a) => a.settings.miniPlayer !== false)
  const [box, setBox] = useState<Box | null>(load) // null = default corner (CSS)
  const el = useRef<HTMLDivElement>(null)
  const g = useRef<{ sx: number; sy: number; r: DOMRect; mode: "move" | "left" | "right"; moved: boolean } | null>(null)
  const swallow = useRef(false) // the click that ends a drag
  const [grip, setGrip] = useState<"left" | "right">("left")

  useEffect(() => {
    const f = () => setBox((b) => (b ? fit(b) : b))
    window.addEventListener("resize", f)
    return () => window.removeEventListener("resize", f)
  }, [])
  // the resize grip sits on the top corner facing the middle of the screen
  useEffect(() => { const r = el.current?.getBoundingClientRect(); if (r) setGrip(r.left + r.width / 2 > window.innerWidth / 2 ? "left" : "right") }, [box, full, s])

  // Settings > Playback > Mini player off: leaving the player (Back or a page opened from it) stops playback
  useEffect(() => { if (s && !full && !miniOn) closePlayer() }, [s, full, miniOn])

  if (!s) return null
  const down = (e: React.PointerEvent, mode: "move" | "left" | "right") => {
    if (full || e.button > 0) return
    swallow.current = false // a drag that ended without a click must not eat this tap
    g.current = { sx: e.clientX, sy: e.clientY, r: el.current!.getBoundingClientRect(), mode, moved: false }
    if (mode !== "move") { e.stopPropagation(); el.current!.setPointerCapture(e.pointerId) }
  }
  const move = (e: React.PointerEvent) => {
    const d = g.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved) {
      if (d.mode === "move" && Math.hypot(dx, dy) < 6) return
      d.moved = true
      el.current!.setPointerCapture(e.pointerId)
    }
    const r = d.r
    if (d.mode === "move") return setBox(fit({ x: r.left + dx, y: r.top + dy, w: r.width }))
    // resize: the opposite bottom corner stays put
    const w = Math.min(maxW(), Math.max(minW(), d.mode === "left" ? r.width - dx : r.width + dx))
    setBox(fit({ w, x: d.mode === "left" ? r.right - w : r.left, y: r.bottom - (w * 9) / 16 }))
  }
  const up = () => {
    const d = g.current
    g.current = null
    if (!d?.moved) return
    swallow.current = true
    setBox((b) => { if (b) localStorage.setItem(KEY, JSON.stringify(b)); return b })
  }

  return (
    <div
      ref={el}
      className={full ? "fixed inset-0" : `pl-mini fixed z-40 aspect-video touch-none select-none overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10${box ? "" : " bottom-[max(1rem,var(--safe-b))] end-4 w-72 md:w-96"}${pip ? " pointer-events-none opacity-0" : ""}`}
      style={!full && box ? { left: box.x, top: box.y, width: box.w } : undefined}
      onPointerDown={(e) => down(e, "move")}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault() } }}
    >
      <Player key={s.key} queue={s.queue} index={s.index} start={s.start} mini={!full} />
      {!full && (
        <span
          aria-hidden
          onPointerDown={(e) => down(e, grip)}
          className={`absolute top-0 z-10 size-6 ${grip === "left" ? "left-0 cursor-nwse-resize rounded-br-lg border-b-2 border-r-2" : "right-0 cursor-nesw-resize rounded-bl-lg border-b-2 border-l-2"} border-white/70 bg-black/40`}
        />
      )}
    </div>
  )
}
