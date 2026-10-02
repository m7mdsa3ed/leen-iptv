import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n"

/** Big category chips (single row that wraps). */
export function KChips({ items, active, onPick, label }: { items: string[]; active: string; onPick: (c: string) => void; label?: (c: string) => string }) {
  return (
    <div data-nav-group role="group" className="kd-chips">
      {items.map((c) => <button key={c} data-nav aria-pressed={c === active} onClick={() => onPick(c)} className="kd-chip"><bdi>{label ? label(c) : c}</bdi></button>)}
    </div>
  )
}

/** Show STEP items at a time with a big "more" button (keeps big grids light). `reset` changes -> back to the first page. */
export function KGrid<T>({ items, render, reset, wide }: { items: T[]; render: (i: T) => ReactNode; reset?: unknown; wide?: boolean }) {
  const t = useT()
  const [n, setN] = useState(30)
  useEffect(() => setN(30), [reset])
  return (
    <>
      <div className={cn("kd-grid", wide && "kd-grid-wide")}>{items.slice(0, n).map(render)}</div>
      {items.length > n && <div className="flex justify-center py-6"><button data-nav className="kd-btn" onClick={() => setN(n + 30)}>{t("kd.more")}</button></div>}
    </>
  )
}

export const KTitle = ({ children }: { children: ReactNode }) => <h2 dir="auto" className="kd-h">{children}</h2>
