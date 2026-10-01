import { Lock, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { KEY } from "@/lib/nav"
import { useApp, useProfile } from "@/lib/store"
import type { Kind } from "@/lib/types"
import { useMode } from "@/lib/device"
import { askPin } from "./ui"

export const FAV = "Favorites"
export const ALL = "All"

/** Category pill row (all modes). Yellow key toggles the parental lock on the focused category. */
export function GroupList({ kind, groups, active, onPick }: { kind: Kind; groups: string[]; active: string; onPick: (g: string) => void }) {
  const p = useProfile()
  const toggleLock = useApp((s) => s.toggleLock)
  const list = [FAV, ALL, ...groups]
  const lockKey = (g: string) => `${kind}|${g}`
  const mode = useMode()
  const toggle = async (g: string) => {
    if (g === FAV || g === ALL || !p?.pin) return
    if (p.locked.includes(lockKey(g)) && !(await askPin(p.pin))) return
    toggleLock(lockKey(g))
  }
  const onKey = (e: React.KeyboardEvent, g: string) => { if (e.keyCode === KEY.yellow) toggle(g) }
  // right-click / touch long-press (contextmenu) toggles the lock outside tv
  const onCtx = (e: React.MouseEvent, g: string) => { if (mode !== "tv" && p?.pin && g !== FAV && g !== ALL) { e.preventDefault(); toggle(g) } }
  return (
    <div className="shrink-0">
      <div className="rail no-scrollbar -mb-2 !gap-2">
        {list.map((g) => (
          <button key={g} data-nav data-pill onKeyDown={(e) => onKey(e, g)} onContextMenu={(e) => onCtx(e, g)} onClick={() => onPick(g)}
            className={cn("flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-base", g === active ? "bg-accent-blue-container text-[#d3e3fd]" : "bg-surface-2 text-foreground/80")}>
            {g === FAV && <Star className="size-4" />}
            {p?.locked.includes(lockKey(g)) && <Lock className="size-3.5" />}
            {g}
          </button>
        ))}
      </div>
      {p?.pin && mode !== "mobile" && <div className="text-sm text-muted-foreground">{mode === "tv" ? "Yellow: lock / unlock category" : "Right-click / long-press: lock"}</div>}
    </div>
  )
}
