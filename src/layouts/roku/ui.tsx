import { useEffect, useState, type ReactNode } from "react"
import { useT } from "@/lib/i18n"

/** Poster grid (children = fluid Cards). */
export const Grid = ({ children }: { children: ReactNode }) => <div className="rk-grid">{children}</div>

/** Scrolling page body; every Roku page sits in one. */
export const Page = ({ children }: { children: ReactNode }) => <div className="rk-page" data-nav-group>{children}</div>

/** Renders 60 at a time, then a Show more button (keeps huge categories light). */
export function Paged<T>({ items, render, grid = true }: { items: T[]; render: (t: T) => ReactNode; grid?: boolean }) {
  const [n, setN] = useState(60)
  const t = useT()
  useEffect(() => setN(60), [items])
  const body = items.slice(0, n).map(render)
  return (
    <>
      {grid ? <Grid>{body}</Grid> : <div className="rk-list">{body}</div>}
      {items.length > n && <div className="py-6 text-center"><button data-nav data-pill onClick={() => setN(n + 60)} className="rk-pill">{t("rk.showMore")}</button></div>}
    </>
  )
}
