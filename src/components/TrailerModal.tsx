import { useEffect, useState } from "react"
import { create } from "zustand"
import { Clapperboard, X } from "lucide-react"
import { isTv } from "@/lib/device"
import { useT } from "@/lib/i18n"
import { focusFirst } from "@/lib/nav"

/** Trailer dialog. Mounted once in App.tsx; Back (App's installNav handler) calls closeTrailer. */
export const useTrailer = create<{ cur: { key: string; name: string } | null }>(() => ({ cur: null }))
export const openTrailer = (cur: { key: string; name: string }) => useTrailer.setState({ cur })
export const closeTrailer = () => useTrailer.setState({ cur: null })

const SRC = (k: string) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(k)}?autoplay=1&controls=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&cc_load_policy=0`

export function TrailerModal() {
  const cur = useTrailer((s) => s.cur)
  const t = useT()
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  useEffect(() => {
    if (!cur) return
    setState("loading")
    requestAnimationFrame(focusFirst)
    const id = window.setTimeout(() => setState((s) => (s === "ready" ? s : "error")), 10000)
    return () => clearTimeout(id)
  }, [cur])
  if (!cur) return null
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("trailer.title", { name: cur.name })} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
      <div className="relative aspect-video w-full max-w-[min(100%,calc((100vh-9rem)*16/9))] overflow-hidden rounded-2xl bg-black" dir="ltr">
        {state !== "error" && (
          <iframe
            title={t("trailer.title", { name: cur.name })}
            src={SRC(cur.key)}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            tabIndex={-1}
            onLoad={() => setState("ready")}
            // TV: key events inside an iframe never reach the page, so it must never take focus or pointer
            style={isTv ? { pointerEvents: "none" } : undefined}
            className="absolute inset-0 size-full border-0"
          />
        )}
        {state === "loading" && <div role="status" aria-label={t("trailer.loading")} className="absolute inset-0 grid animate-pulse place-items-center bg-surface-2/40 text-white/70"><Clapperboard className="size-12" /></div>}
        {state === "error" && <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-lg text-white/80">{t("trailer.error")}</div>}
      </div>
      <div className="flex items-center gap-4">
        <button data-nav data-autofocus="" onClick={closeTrailer} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-medium text-black outline-none focus-visible:ring-4 focus-visible:ring-white/60"><X className="size-5" />{t("trailer.close")}</button>
        <span className="text-sm text-white/60">{t("trailer.privacy")}</span>
      </div>
    </div>
  )
}
