import { useEffect, useRef } from "react"
import { create } from "zustand"
import { Clock, Search as SearchIcon, X } from "lucide-react"
import { Logo } from "@/components/tv/ui"
import { useSearch } from "@/layouts/hooks/use-search"
import { useT } from "@/lib/i18n"
import { navHooks } from "@/lib/nav"
import { isSubmit } from "./keyboard"
import { useSearchHistory } from "@/lib/search-history"
import type { Item } from "@/lib/types"

/** Floating search command (Ctrl/Cmd+K, "/", or any Search button). Empty = recent searches; typing = live results; Enter opens the first match.
    Mounted once in App.tsx; Back (App's installNav handler) calls closePalette. */
export const usePalette = create<{ open: boolean }>(() => ({ open: false }))
export const openPalette = () => usePalette.setState({ open: true })
export const closePalette = () => usePalette.setState({ open: false })

export function SearchPalette() {
  const open = usePalette((s) => s.open)
  return open ? <Panel /> : null
}

const row = "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 py-2 text-start text-lg outline-none"

function Panel() {
  const t = useT()
  const S = useSearch()
  const H = useSearchHistory()
  const ref = useRef<HTMLInputElement>(null)
  const list: Item[] = [...S.movies, ...S.series, ...S.live].slice(0, 30)
  useEffect(() => { ref.current?.focus(); navHooks.text?.(ref.current!) }, []) // TV: open the on-screen keyboard straight away
  const pick = (i: Item) => { S.open(i, S.live); closePalette() }
  const kind = (i: Item) => t(i.kind === "live" ? "search.live" : i.kind === "movie" ? "search.movie" : "search.series")
  return (
    <div data-modal role="dialog" aria-modal="true" aria-label={t("common.search")} className="fixed inset-0 z-[55] flex justify-center bg-background/85 px-[var(--gx)] pb-[var(--safe-b)] pt-[max(5vh,var(--safe-t))]" onClick={closePalette}>
      <div className="flex h-full w-full max-w-[48rem] flex-col text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[var(--fg-10)]">
          <SearchIcon className="size-6 shrink-0 text-muted-foreground" />
          <input ref={ref} dir="auto" data-nav data-autofocus="" type="search" enterKeyHint="search" autoComplete="off" value={S.q} placeholder={t("common.search")}
            onChange={(e) => S.setQ(e.target.value)}
            onKeyDown={(e) => { if (isSubmit(e)) { if (list[0]) pick(list[0]); else H.add(S.q) } }}
            style={{ outline: "none", boxShadow: "none" }} className="h-20 min-w-0 flex-1 bg-transparent text-3xl outline-none placeholder:text-muted-foreground [html[data-mode=mobile]_&]:text-[16px] [&::-webkit-search-cancel-button]:hidden" />
          <button data-nav data-pill aria-label={t("common.close")} onClick={closePalette} className="grid size-11 place-items-center rounded-full text-muted-foreground"><X className="size-5" /></button>
        </div>
        <div data-nav-group className="no-scrollbar min-h-0 flex-1 overflow-y-auto py-3">
          {S.tooShort ? (
            H.list.length ? (
              <>
                <div className="flex items-center justify-between px-4 pb-1 pt-2 text-sm text-muted-foreground">{t("search.recent")}<button data-nav data-pill onClick={H.clear} className="rounded-full px-3 py-1 hover:text-foreground">{t("search.clear")}</button></div>
                {H.list.map((h) => (
                  <div key={h} className="flex items-center">
                    <button data-nav data-pill onClick={() => { S.setQ(h); ref.current?.focus() }} className={`${row} min-w-0 flex-1`}><Clock className="size-5 shrink-0 text-muted-foreground" /><span dir="auto" className="truncate">{h}</span></button>
                    <button data-nav data-pill aria-label={t("search.remove")} onClick={() => H.remove(h)} className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"><X className="size-4" /></button>
                  </div>
                ))}
              </>
            ) : <div className="px-4 py-8 text-center text-muted-foreground">{t("search.hint")}</div>
          ) : list.length ? list.map((i) => (
            <button key={i.id} data-nav data-pill onClick={() => pick(i)} className={row}>
              <Logo item={i} className={`shrink-0 overflow-hidden rounded-lg object-cover text-sm ${i.kind === "live" ? "size-12 !object-contain" : "h-[4.5rem] w-12"}`} />
              <span className="min-w-0 flex-1"><span dir="auto" className="block truncate">{i.name}</span><span className="block truncate text-sm text-muted-foreground">{[kind(i), i.year].filter(Boolean).join(" · ")}</span></span>
            </button>
          )) : <div className="px-4 py-8 text-center text-muted-foreground">{t("search.none")}</div>}
        </div>
      </div>
    </div>
  )
}

/** Ctrl/Cmd+K or "/" (outside text fields) opens the palette. Call once. */
export function installPaletteKeys() {
  const f = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (!typing && e.key === "/")) { e.preventDefault(); openPalette() }
  }
  window.addEventListener("keydown", f)
  return () => window.removeEventListener("keydown", f)
}
