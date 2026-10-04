import { useEffect, useMemo, useState } from "react"
import { Pill } from "@/components/gtv"
import { focusFirst } from "@/lib/nav"
import { useApp } from "@/lib/store"
import { useT } from "@/lib/i18n"
import { loadLogoIndex } from "@/lib/logos"
import { logoKey, searchLogos, type LogoIndex } from "@/lib/logos-pure"
import { cn } from "@/lib/utils"
import { closeLogoMatch, useLogoMatch } from "./match"

/** "Match logo" on a live channel: pick a logo from the bundled index or paste an image link (Settings `logoMatch`), or go back to automatic. */
export function LogoModal() {
  const item = useLogoMatch((s) => s.item)
  const t = useT()
  const matches = useApp((s) => s.settings.logoMatch)
  const setSettings = useApp((s) => s.setSettings)
  const [ix, setIx] = useState<LogoIndex | null | undefined>()
  const [q, setQ] = useState("")
  useEffect(() => {
    if (!item) return
    setQ(item.name)
    void loadLogoIndex().then(setIx)
    requestAnimationFrame(focusFirst)
  }, [item])
  const url = /^https?:\/\/\S+$/i.test(q.trim()) ? q.trim() : ""
  const res = useMemo(() => (ix && !url ? searchLogos(ix, q) : []), [ix, q, url])
  if (!item) return null

  const key = logoKey(item.name)
  const cur = matches?.[key]
  const save = (logo?: string) => {
    const m = { ...matches }
    if (logo) m[key] = logo
    else delete m[key]
    setSettings({ logoMatch: Object.keys(m).length ? m : undefined })
    closeLogoMatch()
  }
  const tile = (src: string, label: string, sub: string, k: string) => (
    <button key={k} data-nav onClick={() => save(src)} className={cn("flex flex-col items-center gap-1 rounded-2xl p-2", src === cur ? "bg-accent-blue-container" : "bg-surface-2")}>
      <div className="grid h-16 w-full place-items-center rounded-lg bg-white/90 p-1.5"><img src={src} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /></div>
      <div dir="auto" className="w-full truncate text-center text-sm">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  )
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("nav.logo.title")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={(e) => e.target === e.currentTarget && closeLogoMatch()}>
      <div className="flex max-h-full w-full max-w-[40rem] flex-col gap-4 rounded-[28px] bg-surface p-6 shadow-2xl">
        <div className="text-center text-2xl font-semibold">{t("nav.logo.title")}</div>
        <div dir="auto" className="truncate text-center text-base text-muted-foreground">{item.name}</div>
        <input data-nav value={q} onChange={(e) => setQ(e.target.value)} type="search" enterKeyHint="search" autoComplete="off"
          placeholder={t("common.search")} aria-label={t("common.search")} dir="auto" className="min-h-11 rounded-full bg-surface-2 px-4 text-base outline-none" />
        <div className="text-sm text-muted-foreground">{t("nav.logo.hint")}</div>
        <div className="-mx-2 grid min-h-0 grid-cols-3 gap-2 overflow-y-auto px-2 sm:grid-cols-4" data-nav-group>
          {url && tile(url, t("nav.logo.url"), "", "url")}
          {!url && ix === undefined && <div className="col-span-full py-4 text-center text-muted-foreground">{t("nav.logo.loading")}</div>}
          {!url && ix !== undefined && res.length === 0 && <div className="col-span-full py-4 text-center text-muted-foreground">{t("nav.logo.empty")}</div>}
          {res.map((r) => tile(r[3], r[0], r[2], r[3] + r[0]))}
        </div>
        <div className="flex gap-2">
          {cur && <Pill data-nav className="flex-1" onClick={() => save()}>{t("nav.match.reset")}</Pill>}
          <Pill data-nav className="flex-1" onClick={closeLogoMatch}>{t("common.cancel")}</Pill>
        </div>
      </div>
    </div>
  )
}
