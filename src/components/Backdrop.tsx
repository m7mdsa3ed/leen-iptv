import { useEffect, useState } from "react"

/** Detail-page backdrop. With several images it crossfades through them every few seconds (not when motion is off);
    images mount lazily, one step ahead, so a long list isn't all fetched at once. Style the wrapper with `className`. */
export function Backdrop({ srcs, className }: { srcs: string[]; className?: string }) {
  const key = srcs.join("|")
  const [cur, setCur] = useState(0)
  useEffect(() => {
    setCur(0)
    if (srcs.length < 2) return
    const id = window.setInterval(() => { if (document.documentElement.dataset.motion !== "off") setCur((c) => (c + 1) % srcs.length) }, 10000)
    return () => clearInterval(id)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className ?? ""}`}>
      {srcs.slice(0, Math.max(cur + 2, 2)).map((s, i) => (
        <img key={s} src={s} alt="" decoding="async" style={{ opacity: i === cur ? 1 : 0 }} className="bg-drift absolute inset-0 size-full object-cover transition-opacity duration-[1400ms]" />
      ))}
    </div>
  )
}
